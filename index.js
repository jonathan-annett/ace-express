
var

fs             = require("fs"),
path           = require("path"),
express        = require("express"),
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


Object.defineProperties(ace,{
   express : {
       value : function (app) {

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
    value : function (theme,file,append_html) {

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

               if (err) return sender.send(notOk);

               fs.rename(tempFile,file,function(err){
                    if (err) return sender.send(notOk);

                    console.log("updated",file,text.length,"bytes");

                    if (connects.length>1) {
                        var json = JSON.stringify ({updated:text});

                        connects.forEach(function(connect){
                            if (connect !== sender ) {
                                connect.send(json);
                            }
                        });

                    }

                    if (onchange) onchange(text,file);
                });

            });
        });


        var expressWs = require('express-ws')(app);

        app.use(require('body-parser').json());

        function fileWasEdited(payload,sender){
            if (payload.file===file && typeof payload.value==='string') {
                fileText.value = payload.value;
            } else {

                if (payload.file===file && typeof payload.diff==='object') {
                    fileText.update(payload.diff,sender.updateDiff);
                }
                sender.send(notOk);
            }
        }

        function editedCallback(req,res){
            return fileWasEdited(req.body,res);
        }

        function editorBrowserCode(editor){

            var

            timeout=false,
            blockChanges=false,
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
                       document.title = file;
                   } else {
                       if (payload.updated) {

                           blockChanges=true;

                           var pos = editor.session.selection.toJSON()
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
                    ws.send(JSON.stringify({file:file,value:editor.getValue()}));
                };

                return updateWS ;

            },
            getUpdateWSPump = function () {
                var

                fileText,

                wsBusy=false,
                ws = new WebSocket("ws://" + location.host + "/");

                var diffPumpUpdate = function(d){
                    console.log(d);
                    ws.send(JSON.stringify({file:file,diff:d}));
                };

                ws.onopen = function() {

                    fileText = window.stringDiff.diffPump(
                        editor.getValue(),
                        diffPumpUpdate,
                        true);

                    fileText.addEventListener(
                        "change",
                        function(text){
                            blockChanges=true;

                            var pos = editor.session.selection.toJSON()
                            editor.session.setValue(text);
                            editor.session.selection.fromJSON(pos);

                            blockChanges=false;
                        });

                };

                ws.onmessage = function (evt) {
                   var payload = JSON.parse(evt.data);

                   if (!!payload.diff) {
                        fileText.update(payload.diff,diffPumpUpdate);
                        document.title = file;
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
                    fileText.value=editor.getValue();
                };

                return getUpdateWSPump ;
            },

            xhr=null,


            updateXHR =function(){
                    timeout=false;
                    if (xhr) {
                        timeout = setTimeout(updateXHR,50);
                        return;
                    }
                    document.title = file + "+";

                    xhr = new XMLHttpRequest();   // new HttpRequest instance
                    xhr.open("POST", "/edited");
                    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
                    xhr.onload = function () {
                        var ok = JSON.parse(xhr.responseText).ok;
                        if (xhr.readyState == 4 && xhr.status == "200") {
                            if (ok) {
                                xhr=null;
                                document.title = file;
                            } else {
                                return document.location.reload();
                            }
                        }
                    }
                    xhr.onerror = function () {
                        xhr=null;
                    }
                    xhr.send(JSON.stringify({file:file,value:editor.getValue()}));
                },



            updateProc = ("WebSocket" in window) ? getUpdateWSPump() : updateXHR;


            editor.getSession().on('change', function() {
                if (blockChanges) return;
                if (timeout) clearTimeout(timeout);
                document.title = file + (!!xhr ? "+" : "*");
                timeout=setTimeout(updateProc,250);
            });
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

                            append(editorBrowserCode);

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
            })


        }

        app.get("/ace/edit",getEditorHtml);
        app.post("/edited",editedCallback);
        app.use("/ace",express.static(ace_dir));
        app.use("/string-diff-regex.js",express.static(stringDiffSrc));

        app.ws('/', function(ws) {

              ws.updateDiff = function (diff,who) {
                  console.log(diff);
                  ws.send(JSON.stringify({file:file,diff:diff}));
              };

              ws.on('message', function(msg) {
                 fileWasEdited(JSON.parse(msg),ws);
              });

              ws.on('close', function() {
                 var ix= connects.indexOf(ws);
                 if (ix>=0) connects.splice(ix,1);
                // console.log({closed:connects.map(function(ws){return "ws";})});
              });


              fileText.addEventListener("diff",ws.updateDiff);
              console.log("newPumpSender");


              //connects.push(ws);
              //console.log({newconnect:connects.map(function(ws){return "ws";})});

        });

        var listener = app.listen(0, function() {
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

    },
    configurable:true,enumerable:true

   },

});

module.exports = ace;
