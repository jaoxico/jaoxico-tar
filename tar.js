var pathMng = require('path');
var fs = require('fs');
var util = require('util');
var inquirer = require('inquirer');
var size = require('byte-size');
var os = require('os');
var zlib = require('zlib');
var tarMng = require('tar');
var mkdirp = require('mkdirp');
var uuid = require('uuid');
var stream = require('stream');
var readline = require('readline');


var tar = pathMng.normalize(process.cwd());
var exp = null;
var session = uuid.v4();
var tmp = os.tmpdir()+'/'+session;

var argv = process.argv;

var h = argv.indexOf('-h');
if (h < 0) h = argv.indexOf('--help');
if (h >= 0) {
    var help = "Como usar:" +
        os.EOL+os.EOL+
        "node tar.js [opções]" +
        os.EOL+
        "Opções:" +
        os.EOL+os.EOL+
        "    -t ou --tar <caminho do arquivo tar>" +
        os.EOL+
        "    -e ou --exp <expressão regular de filtro>"+
        os.EOL+os.EOL;
    console.log(help);
    process.exit(0);
}

for (var a = 0; a < argv.length; a++) {
    if (argv[a] === '--tar' || argv[a] === '-t') {
        a++;
        tar = argv[a];
        if (!(fs.existsSync(tar) && (fs.accessSync(tar, fs.R_OK) === undefined))) {
            console.log('Arquivo tar informado "' + tar + '" é inválido!');
            tar = pathMng.normalize(process.cwd());
        }
    }
    if (argv[a] === '--exp' || argv[a] === '-e') {
        a++;
        exp = new RegExp(argv[a]);
    }
}

var conteudo = {
    lines: 0,
    get: function (path, cb) {
        var found = null;
        var readTmp = fs.createReadStream(tmp);
        var rl = readline.createInterface({
            input: readTmp
        });

        rl.on('line', function (line) {
            entry = JSON.parse(line);
            if (entry.path === path) {
                found = entry;
                rl.close();
            }
        });
        rl.on('close', function () {
            cb(found);
        });
    }
};
var caminho = '';

String.prototype.repeat = function(count) {
    if (count < 1) return '';
    var result = '', pattern = this.valueOf();
    while (count > 1) {
        if (count & 1) result += pattern;
        count >>= 1, pattern += pattern;
    }
    return result + pattern;
};

var isValidFile = function (cb) {
    if (tar === null) {
        cb(false);
        return;
    }
    if (!(fs.existsSync(tar) && (fs.accessSync(tar, fs.R_OK) === undefined))) {
        cb(false);
        return;
    }
    if (fs.statSync(tar).isDirectory()) {
        cb(false);
        return;
    }
    if (conteudo.lines > 0) {
        cb(true);
        return;
    }
    var stat = fs.statSync(tar);
    var dt = 0;
    var perc = 0;
    var hasError = false;
    var writeTmp = fs.createWriteStream(tmp);
    console.log("O tamanho do arquivo selecionado é %s.", size(stat.size));
    var paraTudp = function (error) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write('Erro na leitura do arquivo '+tar+'!');
        conteudo.lines = 0;
        writeTmp.close();
        hasError = true;
        read.resume();
        unzip.resume();
        parse.end();
    };
    var unzip = zlib.createUnzip();
    unzip.on('error', paraTudp);

    var parse = tarMng.Parse();
    parse.on('entry', function (entry) {
        if (parseInt(entry.props.type) === 0) {
            var maximo = process.stdout.columns - perc.length;
            var txt = 'Lendo '+(entry.props.path + ' - ' + size(entry.props.size)).substr(maximo * (-1));
            process.stdout.cursorTo(0);
            process.stdout.write(txt+' '.repeat(maximo - txt.length));
            if (exp === null || exp.test(entry.path)) {
                writeTmp.write(JSON.stringify({
                    path: entry.path,
                    size: entry.size
                }) + '\n');
                conteudo.lines++;
            }
        }
    });
    parse.on('error', paraTudp);
    parse.on('end', function () {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write("Terminada a leitura do arquivo!\n");
        cb(!hasError);
    });

    var read = fs.createReadStream(tar);
    read.on('error', paraTudp);
    read.on('data', function (data) {
        dt += data.length;
        perc = parseInt((dt / stat.size) * 100);
        perc = perc > 0 ? '   '+perc + '% lido' : '';
        if (perc.length > 0) {
            process.stdout.cursorTo(process.stdout.columns - perc.length - 1);
            process.stdout.write(perc);
        }
    });
    console.log('Aguarde a leitura do arquivo!');
    read.pipe(unzip).pipe(parse);
};

var menu = function () {
    var trocar = 0;
    var listar = 1;
    var selecionar = 2;
    var extrair = 3;
    var sair = 4;
    var choices = [{
        name: "Sair",
        value: sair
    }];
    isValidFile(function (is) {
        if (is) {
            console.log("O arquivo possui "+conteudo.lines+" itens.");
            choices.push({
                name: "Visualizar a lista de arquivos",
                value: listar
            });
            choices.push({
                name: "Extrair",
                value: extrair
            });
            choices.push({
                name: "Selecionar outro arquivo tar",
                value: trocar
            });
        } else {
            console.log("Nenhum arquivo foi selecionado.");
            choices.push({
                name: "Selecionar um arquivo tar",
                value: selecionar
            });
        }

        var ordOpcoes = function (a, b) {
            if (a.value < b.value) return -1;
            if (a.value > b.value) return 1;
            return 0;
        }

        choices.sort(ordOpcoes);

        var camposMenu = [
            {
                type: 'list',
                name: 'opcao',
                message: "Selecione uma opção.",
                choices: choices
            }
        ];
        inquirer.prompt(camposMenu, function (resp) {
            switch (resp.opcao) {
                case selecionar:
                    selecionaTar();
                    break;
                case trocar:
                    selecionaTar();
                    break;
                case listar:
                    var file, f;
                    console.log("Lista dos arquivos contidos no pacote:");
                    console.log('-'.repeat(50));
                    var readTmp = fs.createReadStream(tmp);
                    var rl = readline.createInterface({
                        input: readTmp
                    });

                    rl.on('line', function (line) {
                        file = JSON.parse(line);
                        var it = file.path+' - '+size(file.size);
                        console.log(it);
                    });
                    rl.on('close', function () {
                        console.log('-'.repeat(50));
                        menu();
                    });
                break;
                case extrair:
                    fnExtrair();
                break;
                case sair:
                    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
                break;
            }
        });
    });
};

var selecionaTar = function () {
    conteudo.entries = [];
    tar = pathMng.normalize(process.cwd());
    var fnChoices = function (dir) {
        console.log("Aguarde, atualizando a lista de opções.");
        if (dir === undefined) dir = os.homedir() + '/';
        var choices = [
            {
                value: '',
                name: "Voltar ao menu."
            }
        ];
        if (dir !== '//') choices.push({
            name: '\t..',
            value: '..'
        });
        else dir = '/';
        var files = fs.readdirSync(dir);
        var file;
        for (var f in files) {
            file = files[f];
            if (file.match(/^\./g) !== null) continue;
            choices.push({
                value: files[f],
                name: "\t" + files[f]
            });
        }
        var sortChoices = function (a, b) {
            a = ('' + a.value).toLowerCase();
            b = ('' + b.value).toLowerCase();
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        };
        choices.sort(sortChoices);
        return choices;
    };

    var cb = function (resposta) {
        var p = resposta.pacote;
        if (p === '') {
            menu();
            return;
        }

        if (fs.existsSync(tar + '/' + p)) {
            if (fs.accessSync(tar + '/' + p, fs.R_OK) === undefined) {
                if (fs.statSync(tar + '/' + p).isDirectory()) {
                    tar += '/' + p + '/';
                    tar = pathMng.resolve(tar);
                    console.log("Pasta selecionada: " + p);
                    campos[0].choices = fnChoices(tar + '/');
                    campos[0].message = "Você está em " + tar + "\nNavegue nas pastas para encontrar o arquivo do pacote.";
                    inquirer.prompt(campos, cb);
                } else {
                    tar += '/' + p;
                    console.log("Arquivo selecionado: %s", tar);
                    menu();
                }
            } else {
                console.log("Sem permissão de acesso na pasta selecionada.");
                inquirer.prompt(campos, cb);
            }
        } else {
            inquirer.prompt(campos, cb);
        }
    };

    var choices = fnChoices(tar+'/');
    var campos = [
        {
            type: 'list',
            name: 'pacote',
            message: 'Você está em ' + tar + '\nNavegue nas pastas para encontrar o arquivo do pacote.',
            choices: choices
        }
    ];

    inquirer.prompt(campos, cb);
};

var fnExtrair = function () {
    var choices;
    var fnChoices = function (cb) {
        console.log("Aguarde, atualizando a lista de opções.");
        choices = [
            {
                value: '',
                name: "Voltar ao menu."
            },
            {
                value: '*',
                name: "Extrair tudo"
            }
        ];
        if (caminho !== '') choices.push({
            name: '\t..',
            value: '..'
        });
        var file, lastPst;
        var readTmp = fs.createReadStream(tmp);
        var rl = readline.createInterface({
            input: readTmp
        });

        rl.on('line', function (line) {
            file = JSON.parse(line);
            if (caminho.length > 0 && file.path === caminho) rl.close();
            var rCaminho = new RegExp('^' + caminho);
            if (caminho.length === 0 || file.path.match(rCaminho) !== null) {
                var resto = file.path.replace(caminho, '');
                if (resto.match(/\//) === null) {
                    choices.push({
                        value: resto,
                        name: '\t' + resto + ' - ' + size(file.size)
                    });
                } else {
                    var pst = file.path.replace(caminho, '').match(/^[^/]*\//g)[0];
                    if (pst !== lastPst) {
                        lastPst = pst;
                        choices.push({
                            value: pst,
                            name: '\t' + pst
                        });
                    }
                }
            }
        });
        rl.on('close', function () {
            var sortChoices = function (a, b) {
                a = ('' + a.value).toLowerCase();
                b = ('' + b.value).toLowerCase();
                if (a < b) return -1;
                if (a > b) return 1;
                return 0;
            };
            choices.sort(sortChoices);
            cb();
        });
    };

    var cb = function (resposta) {
        var p = resposta.opcao;
        if (p === '') {
            menu();
            return;
        }
        if (p === '*') {
            caminho = caminho.replace(/\/$/, '');
            extrai();
            return;
        }
        if (p === '..') {
            caminho = caminho.replace(/[^/]*\/$/, '');
            fnExtrair();
            return;
        }
        caminho += p;
        conteudo.get(caminho, function (entry) {
            if (entry === null) {
                console.log("Pasta selecionada: " + p);
                fnExtrair();
            } else {
                console.log("Arquivo selecionado: %s", caminho);
                extrai();
            }
        });
    };

    var extrai = function () {
        var re = new RegExp('^'+caminho);
        var gunzip = zlib.createGunzip();
        var parse = tarMng.Parse();
        parse.on('entry', function (entry) {
            var name = entry.props.path.substr(-50);
            if (parseInt(entry.props.type) === 0 && ((caminho.substr(-1) === '/' && entry.props.path.match(re) !== null) || entry.props.path === caminho)) {
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write('Extraindo o arquivo ' + name);
                mkdirp.sync(pathMng.dirname(entry.props.path));
                var writer = fs.createWriteStream(entry.props.path);
                var entryDt = 0;
                var szBefore = '';
                var entryInfo = '';
                var infoSize = 0;
                entry.on('data', function (data) {
                    entryDt += data.length;
                    if (size(entryDt) !== szBefore) {
                        szBefore = size(entryDt);
                        entryInfo = '    '+size(entryDt) + ' de ' + size(entry.props.size);
                        process.stdout.cursorTo(process.stdout.columns - entryInfo.length - 1);
                        process.stdout.write(entryInfo);
                    }
                });
                entry.on('end', function () {
                    if (entry.props.path === caminho) {
                        parse.emit('end');
                    }
                });
                entry.pipe(writer);
            } else {
                if (parseInt(entry.props.type) === 0) {
                    process.stdout.clearLine();
                    process.stdout.cursorTo(0);
                    process.stdout.write('Desconsiderando o arquivo ' + name);
                }
            }
        });
        parse.on('end', function () {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write('Arquivo(s) extraído(s) com sucesso!\n');
            gunzip.unpipe();
            read.unpipe();
            if (fs.existsSync(caminho) && fs.statSync(caminho).isFile()) {
                caminho = caminho.replace(/[^/]*$/, '');
            }
            fnExtrair();
        });

        var read = fs.createReadStream(tar);
        read.pipe(gunzip).pipe(parse);
    };

    var campos = [
        {
            type: 'list',
            name: 'opcao',
            message: (caminho.length > 0 ?'Você está em ' + caminho + '\n' : '')+'Navegue nas pastas para encontrar o arquivo ou diretório desejado.',
        }
    ];

    fnChoices(function () {
        campos[0].choices = choices;
        inquirer.prompt(campos, cb);
    });
};

menu();