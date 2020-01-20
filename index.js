
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
function singleFileEditorBrowserCode(editor,file){

    var

    timeout=false,
    blockChanges=false,
    updating=false,
    getUpdateWS = function () {
        var
        wsBusy=false,
        ws = new WebSocket("ws://" + location.host + "/");
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
        ws = new WebSocket("ws://" + location.host + "/");

        var
        lastDiffHash,
        diffPumpUpdate = function(d){
            console.log({diff_out:d});
            lastDiffHash=d?d[2]:null;
            if (lastDiffHash) {
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
                console.log({diff_in:payload.diff});
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
    editor.getSession().on('change', function() {


        if (blockChanges) return;
        if (timeout) clearTimeout(timeout);
        document.title = file + (updating ? "?" : "*");
        timeout=setTimeout(updateProcErrorCheckWrap,1000,250);
    });
}

function singleFileEditor(theme,file,port,append_html) {

    var
    onchange,
    connects=[],
    fileText = stringDiff.diffPump(fs.readFileSync(file,"utf8"),undefined,true),
    ok='{"ok":true}',
    notOk='{"ok":false}',
    app = express();

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

                if (onchange) onchange(text,file);
            });

        });
    });


    var expressWs = require('express-ws')(app);

    app.use(favicon());
    app.use(require('body-parser').json());

    function fileWasEdited(payload,sender){
        if (payload.file===file && typeof payload.value==='string') {
            fileText.value = payload.value;
        } else {

            if (payload.file===file && typeof payload.diff==='object') {
                fileText.update(payload.diff,sender.updateDiff);
                console.log({diff_in:payload.diff});
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

        var
        html=theme? edit_html.replace(/ace\/theme\/twilight/,'ace/theme/'+theme) : edit_html;
        html = html.replace(
            new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),
        '');

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

        fs.stat(file,function(err,stat){
            if (!err && stat) {
                fs.readFile(file,"utf8",function(err,text){
                    if (!err && typeof text==='string') {
                        fileText.value = text;
                        append(
                            '<script>var file='+JSON.stringify(file)+',str = '+
                                JSON.stringify(fileText.value)
                                    .replace(/</g,"\\u003c")
                                        .replace(/>/g,"\\u003e")+
                                        ';\neditor.setValue(str,-1);document.title=file;</script>');

                        append(singleFileEditorBrowserCode);

                        if (append_html) {
                           append(append_html);
                        }

                        append ("/string-diff-regex.js","head");

                        res.send(html);
                    } else {
                        res.send ("can't edit file "+file+". sorry."+(err?"\n"+err.message:""));
                    }
                });

            } else {
                res.send ("can't edit file "+file+". sorry."+(err?"\n"+err.message:""));
            }
        });

    }

    app.get("/ace/edit",getEditorHtml);
    app.post("/edited",editedCallback);
    app.use("/ace",express.static(ace_dir));
    app.use("/string-diff-regex.js",express.static(stringDiffSrc));

    app.ws('/', function(ws) {

          ws.updateDiff = function (diff,who) {
              console.log({diff_out:diff});
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
          console.log("newPumpSender");


          //connects.push(ws);
          //console.log({newconnect:connects.map(function(ws){return "ws";})});

    });

    var listener = app.listen(port||0, function() {
        console.log('goto http://'+hostname+':' + listener.address().port+"/ace/edit");
    });

    return Object.defineProperties({},{
        on : {
            value  : function (e,fn) {
                if (typeof fn ==='function') {
                    switch (e) {
                        case "change": onchange = fn; break;
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

});

module.exports = ace;


function getFilename() {
    var ix = process.argv.indexOf("--edit");
    if (ix>=2 && ix < process.argv.length-1 ) {
        var filename = process.argv[ix+1];
        if (fs.existsSync(filename)) {
            return filename;
        }
    }
}

function getTheme() {
    var ix = process.argv.indexOf("--theme");
    if (ix>=2 && ix < process.argv.length-1 ) {
        return process.argv[ix+1];
    }
    return "dawn";
}


function getPort() {
    var ix = process.argv.indexOf("--port");
    if (ix>=2 && ix < process.argv.length-1 ) {
        return process.argv[ix+1];
    }
    return 0;// use random port
}

if (process.mainModule===module && process.argv.length>2) {
    var filename = getFilename();
    if (filename ) {
        console.log("edting:",filename);
        singleFileEditor(getTheme(),filename,getPort() );
    }

}
