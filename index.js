#!/usr/bin/env node

var

fs             = require("fs"),
path           = require("path"),
express        = require("express"),
favicon        = require('serve-favicon'),
jsextensions   = require('jsextensions'),
ace_file       = require.resolve("ace-builds"),
ace_editor_dir = path.join(__dirname,"ace-public"),
ace_editor_html_path    = path.join(__dirname,"ace-public","editor.html"),
ace_editor_css_path     = path.join(__dirname,"ace-public","editor.css"),
ace_directory_html_path = path.join(__dirname,"ace-public","editor_dir.html"),
//ace_editor_js_path   = path.join(__dirname,"ace-public","editor.js"),


ace_lib_base_url     = "/ace",
ace_editor_base_url = "/ace/edit_",
ace_editor_html_url = "/ace/edit_/editor.html",
ace_editor_css_url  = "/ace/edit_/editor.css",
ace_editor_js_url   = "/ace/edit_/editor.js",

ace_single_file_open_url = "/ace/edit",
ace_single_file_edit_url = "/ace/editing/",

ace_multi_file_dashboard_url = "/ace/edit",

ace_directory_row_re = new RegExp('<tr class="template_row.*<\/tr>','s'),
ace_directory_html_raw= String.load(ace_directory_html_path),
ace_directory_html= ace_directory_html_raw.replace(ace_directory_row_re,''),
ace_directory_html_template =
    ace_directory_row_re.exec(ace_directory_html_raw)[0]
       .replace(/<tr class="template_row.*>/,'<tr>'),

ace_dir         = path.join(path.dirname(ace_file),".."),
edit_html       = fs.readFileSync(ace_editor_html_path,"utf8"),
demo_html       = edit_html,
demos           = fs.readdirSync(path.join(ace_dir, "demo")).filter(function(x){return x.endsWith(".html");}),
stringDiffRegex = require ("string-diff-regex"),
string_diff_src_path = require.resolve("string-diff-regex"),
//string_diff_src_url  = "/lib/string-diff-regex.js",

ws_prefix      = "/ws/",
remote_ip      = require('@zhike/remote-ip-express-middleware'),

demos_index    = "<html><head></head><body>\n"+
                 '<a href="../editor.html">editor.html</a><br>'+
                  demos.map(function(fn){
                        return '<a href="'+encodeURI(fn)+'">'+fn+'</a>';
                  }).join("<br>\n")+"\n</body></html>",

//chromebooks do something funky with localhost under penguin/crostini, so help a coder out....
hostname = isChromebook() ? "penguin.termina.linux.test" : "localhost",
ace = {};

function isChromebook() {
    var os = require("os");
    if (os.hostname()==="penguin" && os.platform()==="linux") {
        var run=require("child_process").execSync;
        try {
            var cmd = run ("which systemd-detect-virt").toString().trim();
            return (run(cmd).toString().trim()==="lxc");
        } catch (e) {

        }
    }
    return false;
}

//nb this func is never invoked, it's just used to
//hold the source that is injected into the html
// the "arguments" here are just for linting purposes
// they exist as vars in the outer scope which this code is
// injected into.
function singleFileEditorBrowserCode(editor,file,ws_prefix){
    Function.load("string-diff-regex",function(stringDiffRegex){
        var

        timeout=false,
        blockChanges=false,
        updating=false,

        getUpdateWS = function () {
            var
            wsBusy=false,
            ws = new WebSocket("ws://" + location.host + ws_prefix+file);
            ws.onopen = function() {

               // Web Socket is connected, send data using send()
              // ws.send('{"open":true}');
            };

            ws.onmessage = function (evt) {
               var payload = JSON.parse(evt.data);
               if (payload.ok) {
                   wsBusy = false;
                   updating = false;
                   document.title = file;
               } else {
                   if (payload.updated) {

                       blockChanges=true;

                       var pos = editor.session.selection.toJSON();
                       editor.session.setValue(payload.updated);
                       editor.session.selection.fromJSON(pos);

                       blockChanges=false;



                   } else {
                       return document.location.reload();
                   }
               }
            };

            ws.onclose = function() {
               document.location.reload();
            };

            var updateWS = function (){
                timeout=false;
                if (wsBusy) {
                    timeout = setTimeout(updateWS,50);
                    return;
                }
                wsBusy=true;
                document.title = file + "+";
                updating = true;
                ws.send(JSON.stringify({file:file,value:editor.getValue()}));
            };

            return updateWS ;

        },

        getUpdateWSPump = function () {
            var

            fileText,

            wsBusy=false,
            ws = new WebSocket("ws://" + location.host + ws_prefix+file);

            var
            lastDiffHash,
            diffPumpUpdate = function(d,who,init){
                lastDiffHash=d?d[2]:null;
                if (lastDiffHash && !init) {
                    ws.send(JSON.stringify({file:file,diff:d}));
                }
            };

            ws.onopen = function() {

                fileText = window.stringDiffRegex.diffPump(
                    editor.getValue(),
                    diffPumpUpdate,
                    true);

                fileText.addEventListener(
                    "change",
                    function(text,mode){
                        if (!blockChanges && mode !=="set") {
                            blockChanges=true;

                            var pos = editor.session.selection.toJSON();
                            editor.session.setValue(text);
                            editor.session.selection.fromJSON(pos);

                            blockChanges=false;
                        }
                    });

            };

            ws.onmessage = function (evt) {
               var payload = JSON.parse(evt.data);

               if (!!payload.diff) {
                    fileText.update(payload.diff,diffPumpUpdate);

               } else {
                   if (payload.diffAck===lastDiffHash) {
                        wsBusy=false;
                        lastDiffHash=null;
                        document.title = file;
                        updating = false;
                   }
               }

            };

            ws.onclose = function() {
               document.location.reload();
            };

            var updateWSPump = function (){
                timeout=false;
                if (wsBusy) {
                    timeout = setTimeout(updateWSPump,50);
                    return;
                }
                wsBusy=true;
                document.title = file + "+";
                updating=true;
                fileText.value=editor.getValue();
            };

            return updateWSPump ;
        },

        getUpdateXHR = function () {
            var xhr=null,
            updateXHR =function(){
                timeout=false;
                if (xhr) {
                    timeout = setTimeout(updateXHR,50);
                    return;
                }
                document.title = file + "+";
                updating = true;
                xhr = new XMLHttpRequest();   // new HttpRequest instance
                xhr.open("POST", "/edited");
                xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
                xhr.onload = function () {
                    var ok = JSON.parse(xhr.responseText).ok;
                    if (xhr.readyState == 4 && xhr.status == "200") {
                        if (ok) {
                            xhr=null;
                            updating=false;
                            document.title = file;
                        } else {
                            return document.location.reload();
                        }
                    }
                };
                xhr.onerror = function () {
                    xhr=null;
                    updating=false;
                };
                xhr.send(JSON.stringify({file:file,value:editor.getValue()}));
            };
            return updateXHR;
        },

        updateProc = ("WebSocket" in window) ? getUpdateWSPump() : getUpdateXHR(),

        updateProcErrorCheckWrap = function (msec) {
            if (timeout) clearTimeout(timeout);
            if (document.querySelectorAll("#editor div .ace_error").length > 0) {
                document.title = file + "? (errors)";
                timeout=setTimeout(updateProcErrorCheckWrap,msec,Math.max(msec*2,5000));
            } else {
                var hints = document.querySelectorAll("#editor div .ace_info").length;
                if ( hints> 0) {
                    document.title = file + (updating ? "+" : "*")+ " "+hints+" warnings/hints";
                } else {
                    document.title = file + (updating ? "+" : "*");
                }
                timeout=setTimeout(updateProc,5);
            }
        };

        editor.setOptions({
          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace",
          fontSize: "16pt"
        });

        editor.getSession().on('change', function() {


            if (blockChanges) return;
            if (timeout) clearTimeout(timeout);
            document.title = file + (updating ? "?" : "*");
            timeout=setTimeout(updateProcErrorCheckWrap,1000,250);
        });

    });
}

function modeFromFilename(filename) {
    return {   ".css":"css",
               ".html":"html",
               ".json":"json" }
           [ filename.substr(filename.lastIndexOf(".")) ] || "javascript";
}

function getEditorMasterHTML (files,title,theme) {

    function loader() {


        function editFile (file) {
            file = typeof file==='object' && file.target ? file.target.dataset.file: file;
            window.open(ace_single_file_edit_url+file,"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
        }

        document.querySelectorAll("[data-file]").forEach(
            function(btn) {
                btn.addEventListener("click",editFile);
            }
        );



    }

    function temp() {

        var
        ws = new WebSocket("ws://" + location.host + ws_prefix+"/_index");
        ws.onopen = function() {

           // Web Socket is connected, send data using send()
          // ws.send('{"open":true}');
        };

        ws.onmessage = function (evt) {
           var payload = JSON.parse(evt.data);
           if (payload.file) {

           }
        };

        ws.onclose = function() {
           document.location.reload();
        };
    }




   function getFiles () {
        var fileIndex = {};
        files.forEach(function(file){
            var filename = typeof file ==='string' ? file : file.file;
            var editor_theme = typeof file ==='string' ? theme : file.theme;
            var editor_mode  = modeFromFilename(filename);
            var stats = fs.statSync(path.resolve(filename));

            try {
                fileIndex[filename]= {
                    file  : filename,
                    stats : stats,
                    theme: editor_theme,
                    mode : editor_mode,
                    info : {
                        windowCount : 0,
                        sha1 : "",
                    }
                };
            } catch (e) {
                fileIndex[filename]= {
                    file  : filename,
                    stats  : {
                        size  : 0,
                        mtime : new Date(0)
                    },
                    theme : editor_theme,
                    mode : editor_mode,
                    info : {
                        windowCount : 0,
                        sha1 : "",
                    }
                };
            }
        });

        return fileIndex;
    }

    return function getEditLaunchHtml(req,res) {

        var html =  ace_directory_html.htmlGenerator();

        html.append(ace_editor_css_url);
        html.append(title,"title");
        var filesNow = getFiles ();
        html.append({
            ws_prefix : ws_prefix,
            ace_single_file_edit_url : ace_single_file_edit_url,
            files : filesNow
        },"head");

        html.append(
          ace_directory_html_template.renderWithObject(Object.values(filesNow)),
          "table");

        html.append(loader,"body");
        res.send(html.html);
    };
}

function fileEditor(theme,file,app,append_html) {

    var
    onchange,
    onclose,
    onopen,
    connects=[],
    fileText = stringDiffRegex.diffPump(fs.readFileSync(file,"utf8"),undefined,true),
    updaters=[],
    ok='{"ok":true}',
    notOk='{"ok":false}';

    fileText.addEventListener("change",function(text){

        var tempFile = file+(Date.now().toString(36))+(Math.floor(Math.random()*4096).toString(36));

        fs.writeFile(tempFile,text,function(err){

           if (err) return ;

           fs.rename(tempFile,file,function(err){
                if (err) return ;

                console.log("updated",file,text.length,"bytes");

                if (connects.length>1) {
                    var json = JSON.stringify ({updated:text});

                    connects.forEach(function(connect){
                        //if (connect !== sender ) {
                            connect.send(json);
                        //}
                    });

                }

                if (typeof onchange==='function') onchange(text,file);
            });

        });
    });

    function fileWasEdited(payload,sender){
        if (payload.file===file && typeof payload.value==='string') {
            fileText.value = payload.value;
        } else {

            if (payload.file===file && typeof payload.diff==='object') {
                fileText.update(payload.diff,sender.updateDiff);
                sender.send('{"diffAck":"'+payload.diff[2]+'"}');
            } else {
                sender.send(notOk);
            }
        }
    }

    function editedCallback(req,res){
        return fileWasEdited(req.body,res);
    }

    function getEditorHtml(req,res) {

        var html = edit_html.htmlGenerator();

        if (theme) {
            html.replace(/ace\/theme\/twilight/,'ace/theme/'+theme);
        }

        var editor_mode  = modeFromFilename(file);
        if (editor_mode!=="javascript") {
            html.replace(/ace\/mode\/javascript/,'ace/mode/'+editor_mode);
        }

        html.replace('src-noconflict/ace.js',ace_lib_base_url+'/src-min-noconflict/ace.js');

        html.replace(new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),'');

        fs.stat(file,function(err,stat){
            if (!err && stat) {
                fs.readFile(file,"utf8",function(err,text){
                    if (!err && typeof text==='string') {
                        fileText.value = text;

                        html.append({
                            ws_prefix : ws_prefix,
                            file      : file,
                            file_text : fileText.value
                        },"head");

                        html.append ("/js/polyfills.js","head");
                        html.append ("/js/extensions.js","head");

                        html.append(
                            function (editor,file,file_text) {
                                editor.setValue(file_text,-1);document.title=file;
                                file_text=null;
                            }
                        );

                        html.append(singleFileEditorBrowserCode);

                        if (append_html) {
                           html.append(append_html);
                        }

                        res.send(html.html);
                    } else {
                        res.send ("can't edit file "+file+". sorry."+(err?"\n"+err.message:""));
                    }
                });

            } else {
                res.send ("can't edit file "+file+". sorry."+(err?"\n"+err.message:""));
            }
        });

    }

    app.get(ace_single_file_edit_url+file,getEditorHtml);

    app.post("/edited/"+file,editedCallback);

    app.ws(ws_prefix+file, function(ws) {

          ws.updateDiff = function (diff,who) {
              ws.send(JSON.stringify({file:file,diff:diff}));
          };

          ws.on('message', function(msg) {
             fileWasEdited(JSON.parse(msg),ws);
          });

          ws.on('close', function() {
             var ix= connects.indexOf(ws);
             if (ix>=0) {
                 connects.splice(ix,1);
                console.log({closed:connects.map(function(ws){return "ws";})});
            }

            if (ws.updateDiff) {
                fileText.removeEventListener("diff",ws.updateDiff);
                console.log({detached:"ws.updateDiff event for closed socket"});
                updaters = fileText.connections(updaters,'updateDiff');
                if (typeof onclose==='function') onclose(file,updaters);
            }

          });

          ws.on('error', function() {
             var ix= connects.indexOf(ws);
             if (ix>=0) {
                  connects.splice(ix,1);
                 console.log({closed:connects.map(function(ws){return "ws";})});
             }

            if (ws.updateDiff) {
                fileText.removeEventListener("diff",ws.updateDiff);
                console.log({detached:"ws.updateDiff event for error'd socket"});
            }

          });


          fileText.addEventListener("diff",ws.updateDiff);
          updaters.push(ws);
          updaters = fileText.connections(updaters,'updateDiff');

          if (typeof onopen==='function') onopen(file,ws,updaters);



          //connects.push(ws);
          //console.log({newconnect:connects.map(function(ws){return "ws";})});

    });

    return Object.defineProperties({},{
        file : {value : file,enumerable : true,configurable: true },
        on : {
            value  : function (e,fn) {
                if (typeof fn ==='function') {
                    switch (e) {
                        case "change": onchange = fn; break;
                        case "open": onopen = fn; break;
                        case "close": onclose = fn; break;
                    }
                }
            },
            enumerable : true,configurable: true
        },
        text : {
            set : function (value){
                fileText.value = value;
                fs.write(file,fileText.value,function(err){
                    if (err) return console.log(err);
                    if (connects.length===0) return;
                    var payload = JSON.stringify({updated:fileText.value});
                    connects.forEach(function(sender){
                        sender.send(payload);
                    });
                });
            },
            get : function () {
                return fileText.value;
            },
            enumerable : true,configurable: true
        }
    });

}

function singleFileEditor(theme,file,port,append_html) {

    var app = express();
    var expressWs = require('express-ws')(app);

    app.use(remote_ip());
    app.use(favicon());
    app.use(require('body-parser').json());

    app.use(ace_lib_base_url,express.static(ace_dir));
    app.use(ace_editor_base_url,express.static(ace_editor_dir));
    //app.use(string_diff_src_url,express.static(string_diff_src_path));

    var listener = app.listen(port||0, function() {
        console.log('goto http://'+hostname+':' + listener.address().port+ ace_single_file_open_url + "/"+file);
    });

    app.get(ace_single_file_open_url+"/"+file,getEditorMasterHTML ([file],file,theme));

    return fileEditor(theme,file,app,append_html);
}

function multiFileEditor(theme,files,port,append_html) {
    var
    self = {} ,
    events={ change : [], close : [], open: [] },
    emit=function(e,args){
        var fns = events[e];
        if (typeof fns==='object') {
            fns.forEach(function(fn){
                if (typeof fn==='function') fn.apply(this,args);
            });
        }
    },
    addEventListener = function(e,fn) {
        if (typeof fn==='function') {
            var fns = events[e];
            if (typeof fns==='object') {
                fns.push(fn);
            }
        }
    },
    removeEventListener = function(e,fn) {

        var fns = events[e];
        if (typeof fns==='object') {

            if (typeof fn==='function') {
                var ix = fns.indexOf(fn);
                if (ix>=0) fns.splice(ix,1);
            } else {
                if (fn===null) {
                    fns.splice(0,fns.length);
                }
            }

        }
    };

    var app = express();
    var expressWs = require('express-ws')(app);

    app.use(remote_ip());
    app.use(favicon());
    app.use(require('body-parser').json());

    app.use(ace_lib_base_url,express.static(ace_dir));
    app.use(ace_editor_base_url,express.static(ace_editor_dir));
    //app.use(string_diff_src_url,express.static(string_diff_src_path));


    Function.startServer(app,function(){
        var listener = app.listen(port||0, function() {
            console.log('goto http://'+hostname+':' + listener.address().port+ace_multi_file_dashboard_url);
        });
    });

    var editors = {};
    files.forEach(function(file){
        var editor_theme = typeof file ==='string' ? theme : file.theme;
        var filename = typeof file ==='string' ? file : file.file;
        var editor = fileEditor(editor_theme,filename,app,append_html);
        editors[filename] = editor;
        editor.on("change",function(){
            emit("change",[{file:editor.file,text:editor.text}]);
        });
        editor.on("open",function(){
            emit("open",[{file:editor.file,text:editor.text}]);
        });
        editor.on("close",function(){
            emit("close",[{file:editor.file}]);
        });
    });

    app.get(ace_multi_file_dashboard_url,getEditorMasterHTML (files, "editing files",theme) );

    return Object.defineProperties( self,
        {
            files : { value : editors, enumerable:true},
            addEventListener : { value : addEventListener , enumerable:true} ,
            removeEventListener : { value : removeEventListener, enumerable:true},
        }
    );
}

function nodeCLI(argv) {

    function getFilename() {
        var ix = argv.indexOf("--edit");
        if (ix>=2 && ix < argv.length-1 ) {
            var filename = argv[ix+1];
            if (fs.existsSync(filename)) {
                return filename;
            }
        }
    }

    function getFilenames() {
        var files = [];
        var ix = argv.indexOf("--files");
        if (ix>=2 && ix < argv.length-1 ) {
            ix ++;
            var filename = argv[ix];

            while (filename) {
                if (fs.existsSync(filename)) files.push(filename);
                ix ++;
                if (ix >= argv.length-1 ) return files;
                filename = argv[ix];
                if (filename.startsWith('--')) return files;
            }

        }

        ix = argv.indexOf("--dirs");
        if (ix>=2 && ix < argv.length-1 ) {
            ix ++;
            var
            dirname = argv[ix],
            file_path_mapper = function(fn){return path.join(dirname,fn);};

            while (dirname) {
                if (fs.existsSync(dirname)&& fs.statSync(dirname).isDirectory() ) {
                        files=files.concat(fs.readdirSync(dirname).map(file_path_mapper))
                    }
                ix ++;
                if (ix >= argv.length-1 ) return files;
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
        return 0;// use random port
    }

    var filename = getFilename();
    var files = getFilenames();
    if (filename && files.length===0) {
        singleFileEditor(getTheme(),filename,getPort() );
    } else {

        if (filename && files.indexOf(filename)<0) {
            files[ process.argv.indexOf("--edit") < process.argv.indexOf("--files")  ? 'unshift' : 'push'](filename);
        }

        if (files.length>0) {
            multiFileEditor(getTheme(),files,getPort() );
        }
    }

}

Object.defineProperties(ace,{
   express : {
       value : function (app) {
           app.use(favicon());
           app.get(ace_lib_base_url+"/editor.html",function(req,res) {
                res.send(demo_html);
           });
           app.get(ace_lib_base_url+"/demo/",function(req,res) {
                res.send(demos_index);
           });

           app.use(ace_lib_base_url,express.static(ace_dir));
       },
       configurable:true,enumerable:true
   },
   demo : {
    value : function (theme,port) {
        demo_html=theme? edit_html.split('ace/theme/twilight').join('ace/theme/'+theme) : edit_html;
        var app;
        ace.express(app=express());
        var listener = app.listen(port||3000, function() {
          console.log('goto http://'+hostname+':' + listener.address().port+ace_lib_base_url+"/editor.html");
        });

    },
    configurable:true,enumerable:true

   },
   edit : {
    value : singleFileEditor,
    configurable:true,enumerable:true

   },

   editMulti : {
    value : multiFileEditor,
    configurable:true,enumerable:true

   },
   cli  : {
       value : nodeCLI,
        configurable:true,enumerable:true

  }

});

module.exports = ace;

if (process.mainModule===module && process.argv.length>2) {
    nodeCLI(process.argv);
}
