
var

fs             = require("fs"),
path           = require("path"),
express        = require("express"),
favicon        = require('serve-favicon'),
ace_file       = require.resolve("ace-builds"),
ace_dir        = path.join(path.dirname(ace_file),".."),
edit_html_file = path.join(ace_dir, "editor.html"),
edit_html      = fs.readFileSync(edit_html_file,"utf8"),
demo_html      = edit_html,
demos          = fs.readdirSync(path.join(ace_dir, "demo")).filter(function(x){return x.endsWith(".html");}),
stringDiff     = require ("string-diff-regex"),
stringDiffSrc  = require.resolve("string-diff-regex"),
ws_prefix      = "/ws/",

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

            fileText = window.stringDiff.diffPump(
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
}

function htmlGenerator(template) {
    var html = ""+template;
    var append=function(h,where){
        where = "</"+(where || "body")+">";
        if (typeof h==='function') {
            h = h.toString();
            h = "<script>"+h.substring(h.search(/{/)+1,h.length-1)+"</script>";
        } else {
            if (h.startsWith("/") && (h.indexOf(" ")<0)&&h.endsWith(".js")) {
                h = '<script src="'+h+'"></script>';
            }
        }
        html = html.replace(where,h+"\n"+where);
    };
    var self = {};
    return Object.defineProperties(self,{
        html: {
            get : function (){ return html;},
            enumerable:true,configurable:true
        },
        append: {
            value : function (h,where) {
                append(h,where);
                return self;
            },
            enumerable:true,configurable:true
        },
        replace : {
            value : function (a,b) {
                html = html.replace(a,b);
                return self;
            },
            enumerable:true,configurable:true
        }

    });

}

function getEditorMasterHTML (files,title) {
    
    var htmlTemplate = '<head><title></title></head><body><div></div></body>';
    
    function loader() {
        

        function editFile (file) {
            file = typeof file==='object' && file.target ? file.target.dataset.file: file;
            window.open("/ace/editing/"+file,"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
        }
        document.querySelectorAll("[data-file]").forEach(
            function(btn) {
                btn.addEventListener("click",editFile);
            }
        );

    }
    function buttonHtml (files) {
      
        return '<table><tr>'+
        files.map(function(file){
            var editor_theme = typeof file ==='string' ? theme : file.theme;
            var filename = typeof file ==='string' ? file : file.file;
    
            try {
                var stats = fs.statSync(path.resolve(filename));
                return '<td>'+filename+'</td>'+
                       '<td>'+stats.mtime.toUTCString()+'</td>'+
                       '<td>'+stats.size.toString()+'</td>'+
                       '<td>'+editor_theme+'</td>'+
                       '<td><button data-file="'+filename+'">edit</button></td>';
            } catch (e) {
                return '<td>'+filename+'</td>'+
                       '<td>'+e.message+'</td>'+
                       '<td>&nbsp;</td>'+
                       '<td>'+editor_theme+'</td>'+
                       '<td><button disabled data-file="'+filename+'">edit</button></td>';
            }

        }).join('</tr><tr>\n')+'</tr></table>';
    }

    return function getEditLaunchHtml(req,res) {
        var html =  htmlGenerator("<html></html>")
        .append(htmlTemplate,"html")
        .append(title,"title")
        .append(buttonHtml (files) ,'div')
        .append(loader,"body").html;
        res.send(html);
    };
}

function fileEditor(theme,file,app,append_html) {

    var
    onchange,
    onclose,
    onopen,
    connects=[],
    fileText = stringDiff.diffPump(fs.readFileSync(file,"utf8"),undefined,true),
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

        var html = htmlGenerator(edit_html);

        if (theme) {
            html.replace(/ace\/theme\/twilight/,'ace/theme/'+theme);
        }

        html.replace('src-noconflict/ace.js','/ace/src-min-noconflict/ace.js');

        html.replace(new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),'');

        fs.stat(file,function(err,stat){
            if (!err && stat) {
                fs.readFile(file,"utf8",function(err,text){
                    if (!err && typeof text==='string') {
                        fileText.value = text;
                        html.append(
                            '<script>\n'+
                            'var file='+JSON.stringify(file)+','+
                                'ws_prefix = '+JSON.stringify(ws_prefix)+','+
                                'str = '+
                                    JSON.stringify(fileText.value)
                                        .replace(/</g,"\\u003c")
                                            .replace(/>/g,"\\u003e")+ ';\n'+
                                'editor.setValue(str,-1);document.title=file;\n</script>');

                        html.append(singleFileEditorBrowserCode);

                        if (append_html) {
                           html.append(append_html);
                        }

                        html.append ("/string-diff-regex.js","head");

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

    app.get("/ace/editing/"+file,getEditorHtml);

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

    app.use(favicon());
    app.use(require('body-parser').json());

    app.use("/ace",express.static(ace_dir));
    app.use("/string-diff-regex.js",express.static(stringDiffSrc));

    var listener = app.listen(port||0, function() {
        console.log('goto http://'+hostname+':' + listener.address().port+"/ace/edit/"+file);
    });

    app.get("/ace/edit/"+file,getEditorMasterHTML ([file],file));

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

    app.use(favicon());
    app.use(require('body-parser').json());

    app.use("/ace",express.static(ace_dir));
    app.use("/string-diff-regex.js",express.static(stringDiffSrc));

    var listener = app.listen(port||0, function() {
        console.log('goto http://'+hostname+':' + listener.address().port+"/ace/edit");
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

    app.get("/ace/edit",getEditorMasterHTML (files, "editing files") );


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
        var ix = argv.indexOf("--files");
        if (ix>=2 && ix < argv.length-1 ) {
            var files = [];
            ix ++;
            var filename = argv[ix];

            while (filename) {
                if (fs.existsSync(filename)) files.push(filename);
                ix ++;
                if (ix >= argv.length-1 ) return files;
                filename = argv[ix];
                if (filename.startsWith('--')) return files;
            }

            return files;
        }
        return [];
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
           app.get("/ace/editor.html",function(req,res) {
                res.send(demo_html);
           });
           app.get("/ace/demo/",function(req,res) {
                res.send(demos_index);
           });

           app.use("/ace",express.static(ace_dir));


       },
       configurable:true,enumerable:true
   },
   demo : {
    value : function (theme,port) {
        demo_html=theme? edit_html.split('ace/theme/twilight').join('ace/theme/'+theme) : edit_html;
        var app;
        ace.express(app=express());
        var listener = app.listen(port||3000, function() {
          console.log('goto http://'+hostname+':' + listener.address().port+"/ace/editor.html");
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
