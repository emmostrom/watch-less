#!/usr/bin/env node

var fs = require('fs');
var util = require('util');
var path = require('path');
var walk = require('walk');
var less = require('less');

var parsing = 0;
var done = false;


var argv = require('optimist')
    .usage('Usage: {OPTIONS}')
    .wrap(80)
    .option('compress', {
      alias: 'c',
      desc: 'Compresses the output'
    })
    .option('directory', {
      alias: 'd',
      desc: 'Define the root directory to watch, if this is not defined the program will use the current working directory.'
    })
    .option('output', {
      alias: 'r',
      desc: 'CSS Output directory.'
    })
    .option('extension', {
        alias: 'e',
        desc: 'Sets the extension of the files that will be generated.  Defaults to .less.css'
    })
    .option('source_map', {
        alias: 's',
        desc: 'Sets the sourcemap of the files that will be generated.  Defaults false'
    })
    .option('ignore', {
        alias: 'i',
        desc: 'Sets the program to ignore a list of directories by name'
    })
    .option('optimization', {
        alias: 'o',
        desc: 'Sets the optimization level for the less compiler, options are: 0, 1, and 2'
    })
    .option('watch-stdin', {
        alias: 'w',
        desc: 'Exits if stdin closes'
    })
    .option('once', {
        alias: 'x',
        desc: 'Exit after processing files once'
    })
    .option('help', {
      alias: 'h',
      desc: 'Show this message'
    })
    .check(function(argv) {
      if (argv.help) {
        throw '';
      }
    }).argv;

var rootDirectory = path.resolve(process.cwd(), argv.directory != null ? argv.directory : '');
var outputDirectory = argv.output != null ? path.resolve(process.cwd(), argv.output) : rootDirectory;

var extension = argv.extension != null ? argv.extension[0] == '.' ? argv.extension : '.' + argv.extension : '.less.css'

var ignoreList = (function(){
    if(argv.ignore != null){
        if(typeof argv.ignore === "string")
            return [argv.ignore]

        return argv.ignore;
    }

    return [];
})();

var options = {
    compress: argv.compress != null,
    optimization: argv.optimization != null ? parseInt(argv.optimization) : 0,
    sourceMap: argv.source_map != null ? true : false,
    watchStdIn: argv['watch-stdin'] != null,
    runOnce: argv.once != null
};

var parseLessFile = function(input, output){
    parsing++;
    return function (e, data) {
        if (e) {
            console.log("lessc: " + e.message);
        }

        var sourceMapOptions = {};
        if (options.sourceMap) {
            sourceMapOptions.sourceMapInputFilename = input;
            // its in the same directory, so always just the basename
            sourceMapOptions.sourceMapOutputFilename = path.basename(output);
            sourceMapOptions.sourceMapFullFilename = output + ".map";
            // its in the same directory, so always just the basename
            sourceMapOptions.sourceMapFilename = path.basename(sourceMapOptions.sourceMapFullFilename);
            sourceMapOptions.sourceMapBasepath = input ? path.dirname(input) : process.cwd();
            var pathToMap = path.dirname(sourceMapOptions.sourceMapFullFilename),
                pathToInput = path.dirname(sourceMapOptions.sourceMapInputFilename);
            sourceMapOptions.sourceMapRootpath = path.relative(pathToMap, pathToInput);
        }

        var lessOptions = {
            paths: [path.dirname(input)],
            optimization: options.optimization,
            filename: input,
            sourceMap: sourceMapOptions
        };

        less.render(data, lessOptions)
            .then(function(lessOutput){
                if(lessOutput && lessOutput.css){
                    var css = lessOutput.css;
                    var fd = fs.openSync(output, "w");
                    fs.writeSync(fd, css, 0, "utf8");
                }
                parsing--;
                checkEnd();
            }, function(error) {
                less.writeError(error, options);
                parsing--;
                checkEnd();
            });
    };
};

var ouputPath = function(filePath) {
    return path.resolve(outputDirectory, filePath.slice(rootDirectory.length + 1, filePath.length - 5) + extension);
};

/*
 * Accepts a path to a .less file and compiles a .css file from it:
 */
var compileLessFile = function(lessFile) {
    var cssFile = ouputPath(lessFile);

    console.log("updating: " + cssFile);
    fs.readFile(lessFile, 'utf-8', parseLessFile(lessFile, cssFile));
};

var walker = walk.walk(rootDirectory, { followLinks: false });

walker.on('directories', function(root, dirStatsArray, next) {
    dirStatsArray.forEach(function (dirStats, index, arr) {
        if (ignoreList.indexOf(dirStats.name) !== -1) {
            arr.splice(index, 1);
            console.log('Ignoring: ', dirStats.name);
        }
    });
    next();
});

walker.on('file', function(root, fileStats, next) {
    if(/.*\.(less)$/.test(fileStats.name) && fileStats.name.indexOf("_") != 0){
        var filePath = path.resolve(root, fileStats.name);

        // Compile .less file on startup:
        compileLessFile(filePath);

        if(!options.runOnce) {
            fs.watchFile(filePath, function(curr, prev){
                compileLessFile(filePath);
            });
        }
    }
    next();
});

walker.on('errors', function(root, nodeStatsArray, next) {
    next();
});

var checkEnd = function(){
  if(done && parsing == 0 && options.runOnce)
    process.exit(0);
}

if(options.runOnce){
    walker.on("end", function () {
        done = true;
        checkEnd();
    });
}

if(options.watchStdIn) {
    process.stdin.on('end', function () {
        process.exit(0);
    });
    process.stdin.resume();
}

