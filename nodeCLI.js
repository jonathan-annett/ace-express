// jshint undef:true
// jshint node:true

module.exports = function (
    singleFileEditor,
    multiFileEditor
) {

    var
    
    fs                      = require("fs"),
    path                    = require("path"),
    child_process           = require("child_process");
    
    return function nodeCLI(argv) {
           
               function getFilenames() {
                   var files = [];
                   var ix = argv.indexOf("--files");
                   if (ix>=2 && ix < argv.length-1 ) {
                       ix ++;
                       var filename = argv[ix];
           
                       while (filename) {
                           if (fs.existsSync(filename)) files.push(filename);
                           ix ++;
                           if (ix >= argv.length ) break;
                           filename = argv[ix];
                           if (filename.startsWith('--')) break;
                       }
           
                   }
           
                   ix = argv.indexOf("--dirs");
                   if (ix>=2 && ix < argv.length-1 ) {
                       ix ++;
                       var
                       dirname = argv[ix],
                       file_path_mapper = function(fn){return path.join(dirname,fn);},
                       nm="node_modules",
                       not_hidden = function(fn){ 
                           if ( fn.startsWith("./") || fn.startsWith("../") ) return true;  
                           return !fn.startsWith(".") &&  !fn.startsWith(nm+"/") && fn!==nm; 
                           
                       };
           
                       while (dirname) {
                           
                           if (   not_hidden(dirname) &&  
                                  fs.existsSync(dirname) && 
                                  fs.statSync(dirname).isDirectory() ) {
                                   files=files.concat(
                                       fs.readdirSync(dirname,{recursive:true})
                                       .filter(not_hidden)
                                       .map(file_path_mapper)
                                   );
                               }
                           ix ++;
                           if (ix >= argv.length ) return files;
                           dirname = argv[ix];
                           if (dirname.startsWith('--')) return files;
                       }
           
                   }
                   return files;
               }
           
               function getTheme() {
                   var ix = argv.indexOf("--theme");
                   if (ix>=2 && ix < argv.length-1 ) {
                       return argv[ix+1];
                   }
                   return "dawn";
               }
           
               function getPort() {
                   var ix = argv.indexOf("--port");
                   if (ix>=2 && ix < argv.length-1 ) {
                       return argv[ix+1];
                   }
                   
                   return process.env.ACE_EXPRESS_PORT || 0;// use random port
               }
           
               var files = getFilenames();
               if (files.length>0) {
                   var eds = multiFileEditor(getTheme(),files,getPort() );
                   
                   eds.addEventListener("close",function(){
                       console.log("close",arguments);
                   });
               }
           
           };
};