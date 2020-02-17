
module.exports = function (
    ace_dir,
    ace_editor_dir,
    ace_lib_base_url,
    ace_editor_base_url,
    ace_single_file_open_url,
    editor_CLI_KeyLoop,
    encodeURIPath,
    getEditorMasterHTML,
    fileEditor) {

var 
hostname = require("get-localhost-hostname"),
express = require("express"),
favicon                 = require('serve-favicon'),
remote_ip      = require('@zhike/remote-ip-express-middleware');


return function singleFileEditor(theme,file,port,append_html) {

    var app = express();
    var expressWs = require('express-ws')(app);
    var faExpress = require('font-awesome-express')(app);
    
    var perf_now_time           = require('perf_now_time');
    perf_now_time.express(express,app);


    app.use(remote_ip());
    app.use(favicon());
    app.use(require('body-parser').json());

    app.use(ace_lib_base_url,express.static(ace_dir));
    app.use(ace_editor_base_url,express.static(ace_editor_dir));
    
    Function.startServer(app,function(){
        var url =  'http://'+hostname+':' + listener.address().port+ ace_single_file_open_url + "/"+encodeURIPath(file);
        var listener = app.listen(port||0, function() {
            editor_CLI_KeyLoop(url);
        });
        
        app.get(
                url,
                getEditorMasterHTML ([file],
                    file,
                    theme,
                    faExpress,
                    function(editFile,files){
                        editFile(Object.keys(files)[0]);
                    }
                )
            );
    
    });

    return fileEditor(theme,file,app,append_html);
}


};