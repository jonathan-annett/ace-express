#!/usr/bin/env node

var

fs                      = require("fs"),
path                    = require("path"),
child_process           = require("child_process"),
express                 = require("express"),
favicon                 = require('serve-favicon'),
jsextensions            = require('jsextensions'),
swizzleRoute            = require ('express-swizzle-route'),

md2html                 = require('@bonniernews/md2html').render,
ace_file                = require.resolve("ace-builds"),
ace_editor_dir          = path.join(__dirname,"ace-public"),
ace_editor_html_path    = path.join(__dirname,"ace-public","editor.html"),
ace_editor_debug_path   = path.join(__dirname,"ace-public","debug.html"),
ace_editor_css_path     = path.join(__dirname,"ace-public","editor.css"),
ace_directory_html_path = path.join(__dirname,"ace-public","editor_dir.html"),
//ace_editor_js_path   = path.join(__dirname,"ace-public","editor.js"),



ace_lib_base_url    = "/ace",
ace_editor_base_url = "/ace/edit_",
ace_editor_html_url = "/ace/edit_/editor.html",
ace_editor_css_url  = "/ace/edit_/editor.css",
ace_editor_js_url   = "/ace/edit_/editor.js",

ace_single_file_open_url  = "/ace/edit",
ace_single_file_edit_url  = "/ace/editing/",
ace_single_file_debug_url = "/ace/debugging/",
ace_single_file_serve_url = "/ace/serving/",
ace_single_serve_dir_url=function(filename) {
    return ace_single_file_serve_url + encodeURIPath(filename);
},
ace_single_serve_file_url=function(filename) {
    var parts = filename.split("/"),basename=parts.pop(),dirname=parts.join("/");
    return ace_single_file_serve_url + encodeURIPath(filename+"/"+basename);
},

ace_multi_file_dashboard_url = "/ace/edit",

ace_directory_html= String.load(ace_directory_html_path),

ace_dir         = path.join(path.dirname(ace_file),".."),
get_editor_files = function(regex) {
    return fs.readdirSync(path.join(ace_dir,"src"))
    .filter(function(fn){
         return !!regex.exec(fn); 
    })
    .map(function(fn){
        return regex.exec(fn).groups.result;
    });
},
editor_themes   = get_editor_files(/(^theme-)(?<result>.*)(\.js$)/),
editor_modes    = get_editor_files(/(^mode-)(?<result>.*)(\.js$)/),
edit_html       = fs.readFileSync(ace_editor_html_path,"utf8"),
debug_html      = fs.readFileSync(ace_editor_debug_path,"utf8"),
demo_html_raw   = fs.readFileSync(path.join(ace_dir,"editor.html"),"utf8"),
demo_html       = demo_html_raw,
demos           = fs.readdirSync(path.join(ace_dir, "demo")).filter(function(x){return x.endsWith(".html");}),
stringDiffRegex = require ("string-diff-regex"),
string_diff_src_path = require.resolve("string-diff-regex"),
//string_diff_src_url  = "/lib/string-diff-regex.js",

ws_prefix      = "/ws/",

edited_http_prefix  = "/edited/",

remote_ip      = require('@zhike/remote-ip-express-middleware'),

demos_index    = "<html><head></head><body>\n"+
                 '<a href="../editor.html">editor.html</a><br>'+
                  demos.map(function(fn){
                        return '<a href="'+encodeURI(fn)+'">'+fn+'</a>';
                  }).join("<br>\n")+"\n</body></html>",

//chromebooks do something funky with localhost under penguin/crostini, so help a coder out....
hostname = require("get-localhost-hostname"),
acelib = {};



function getDatasetField(fld,target) {
    if (!target|| !target.dataset) {
        return null;
    }
    if (target.dataset[fld]) return target.dataset[fld];
    return getDatasetField(fld,target.parentElement);
}


function editorListHtml(array,noun){
    return array.map(function(name){
       return [ 
            '<li data-'+noun+'="'+name+'" id="mnu_'+name+'_'+noun+'" class="menu-item">',
            '   <button class="menu-btn">',
            '      <i class="fa fa-tint"></i>',
            '      <span class="menu-text">'+name+'</span>',
            '   </button>',
            '</li>'
           ].join('\n');
    }).join('\n');
}

function editorThemesHtml(){
    return editorListHtml(editor_themes,"theme")
}

function editorModesHtml(){
    return editorListHtml(editor_modes,"mode")
}


function setEditorThemeClick(ev) {
    
    var els =  editor_themes.map(function(theme){
        /*global getEl*/
        return getEl('mnu_'+theme+'_theme');
    });
    
    if (setEditorThemeClick._last) {
        els.forEach(removeThemeClick);
    }

    els.forEach(addThemeClick);
    
    setEditorThemeClick._last = onMouseDown;
   
    
   
    function onMouseDown (e) {
        ev(getDatasetField("theme",e.target));
    }
    
    function removeThemeClick(el){
        el.removeEventListener("mousedown",setEditorThemeClick._last);
    }
    
    function addThemeClick(el){
        el.addEventListener("mousedown",onMouseDown);
    }

}


function setEditorModeClick(ev) {
    
    var els =  editor_modes.map(function(mode){
        /*global getEl*/
        return getEl('mnu_'+mode+'_mode');
    });
    
    if (setEditorModeClick._last) {
        els.forEach(removeModeClick);
    }

    els.forEach(addModeClick);
    
    setEditorModeClick._last = onMouseDown;
   
    function onMouseDown (e) {
        ev(getDatasetField("mode",e.target));
    }
    
    function removeModeClick(el){
        el.removeEventListener("mousedown",setEditorModeClick._last);
    }
    
    function addModeClick(el){
        el.addEventListener("mousedown",onMouseDown);
    }

}


function encodeURIPath(f) {
    return (f.replace(/^\.\//,'')).split("/")
        .map(encodeURIComponent)
            .map(function (x){
                return x===".."?"~~":x;
            }).join("/");
}

function doc_browser_shorthand () {
        
    var doc      = document, 
        docMeth  = function(m){return doc[m].bind(doc);},
        docWrite = docMeth("write"),
        getEl    = docMeth("getElementById"),
        qrySel   = docMeth("querySelector"),
        qryAll   = docMeth("querySelectorAll"),
        docEl    = doc.documentElement;
    
}

//nb this func is never invoked, it's just used to
//hold the source that is injected into the html
// the "arguments" here are just for linting purposes
// they exist as vars in the outer scope which this code is
// injected into.
function singleFileEditorBrowserCode(
    // set by doc_browser_shorthand ()
    doc,docMeth,docWrite,getEl,qrySel,qryAll,docEl,
    editor,file,file_uri,file_text,editor_mode,theme,ws_prefix,edited_http_prefix){
    Function.load("string-diff-regex",function(stringDiffRegex){
        var

        editor = ace.edit("editor"),

        timeout=false,
        blockChanges=false,
        updating=false,
        
        update_init_interval=1,
        update_busy_interval=10,
        update_check_interval=250,
        update_error_interval=5000,
        update_fallback_interval=50,
    
        /*
        update_init_interval=5,
        update_busy_interval=50,
        update_check_interval=1000,
        update_error_interval=5000,
        update_fallback_interval=250,
        */

        getUpdateWSPump = function () {
            var

            fileText,

            wsBusy=false,
            ws = new WebSocket("ws://" + location.host + ws_prefix+file_uri);

            var
            lastDiffHash,
            diffPumpUpdate = function(d,who,init){
                lastDiffHash=d?d[2]:null;
                if (lastDiffHash && !init) {
                    var payload = fileText.payload || {};
                    payload.file=file;
                    payload.diff=d;
                    ws.send(JSON.stringify(payload));
                    if (fileText.payload) delete fileText.payload;
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
                   } else {
                       if (payload.file===file && typeof payload.renamed==='string') {
                           file = payload.renamed;
                           document.title = file;
                       } else {
                           
                           if (payload.file===file && typeof payload.theme==='string') {
                               theme = payload.theme;
                               editor.setTheme("ace/theme/"+theme);
                           } else {
                                 
                                 if (payload.file===file && typeof payload.editor_mode==='string') {
                                     editor_mode = payload.editor_mode;
                                     editor.session.setMode("ace/mode/"+(editor_mode));
                                 } 
                                 
                             }
                           
                       }
                   }
               }

            };

            ws.onclose = function() {
                
               window.close();
               // if still open, it's not an external window opened via javascript, 
               // so force document.location.reload() which closes the embedded page 
               document.location.reload();
               
            };

            var updateWSPump = function (payload){
                timeout=false;
                if (wsBusy) {
                    timeout = setTimeout(updateWSPump,update_busy_interval);
                    return;
                }
                wsBusy=true;
                document.title = file + "+";
                updating=true;
                fileText.payload = payload;
                fileText.value=editor.getValue();
            };

            return updateWSPump ;
        },

        getUpdateXHR = function () {
            var xhr=null,
            updateXHR =function(payload){
                timeout=false;
                if (xhr) {
                    timeout = setTimeout(updateXHR,update_busy_interval);
                    return;
                }
                document.title = file + "+";
                updating = true;
                xhr = new XMLHttpRequest();   // new HttpRequest instance
                xhr.open("POST", edited_http_prefix+file);
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
                payload=payload||{};
                payload.file=file;
                payload.value=editor.getValue();
                xhr.send(JSON.stringify(payload));
            };
            return updateXHR;
        },

        updateProc = ("WebSocket" in window) ? getUpdateWSPump() : getUpdateXHR(),

        updateProcErrorCheckWrap = function (msec,last_payload) {
            var payload = {
                errors:qryAll("#editor div .ace_error").length,
                warnings:qryAll("#editor div .ace_warning").length,
                hints:qryAll("#editor div .ace_hint").length
            };

            if (timeout) clearTimeout(timeout);
            if (payload.errors > 0 && ((!last_payload) || (last_payload && last_payload.errors!==payload.errors))) {
                document.title = file + "? (errors)";
                timeout=setTimeout(updateProcErrorCheckWrap,msec,Math.max(msec*2,update_error_interval),payload);
            } else {
                if ( payload.warnings+payload.errors  > 0) {
                    document.title = file + (updating ? "+" : "*")+ " "+payload.warnings+payload.errors + " warnings/errors";
                } else {
                    document.title = file + (updating ? "+" : "*");
                }
                timeout=setTimeout(updateProc,update_init_interval,payload);
            }
        };

        editor.setTheme("ace/theme/"+(theme||"cobalt"));
        editor.session.setMode("ace/mode/"+(editor_mode||"javascript"));

        editor.setValue(file_text,-1);
        document.title=file;
        file_text=null;

        editor.setOptions({
          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace",
          fontSize: "16pt"
        });
        
        var 
        
        getThisEditor = function() {
            return editor;
        },
        onActivated = function(){
            window.top.getCurrentEditor = getThisEditor;
            console.log("active:",file);
        };
        
        editor.getSession().on('change', function() {
            if (blockChanges) return;
            if (timeout) clearTimeout(timeout);
            document.title = file + (updating ? "?" : "*");
            timeout=setTimeout(updateProcErrorCheckWrap,update_check_interval,update_fallback_interval);
        });
        
        
        editor.addEventListener("focus",onActivated);
        //editor.addEventListener("mousedown",onActivated);
        //editor.addEventListener("keydown",onActivated);
        
        onActivated();
        
        window.top.files[file].getEditor=getThisEditor;

    });
    
    if (window.top===window && location.search.search(/(\?|&)fs=1(&|$)/)>=0) {
        // when started with ?fs=1, show fullscreen and close when user exits fullscreen
        docEl.addEventListener('fullscreenchange', function (event) {
          if (!document.fullscreenElement) {
              window.close();
          }
        });
        
        docEl.requestFullscreen();
    } 
    
    function onContextMenu(e) {
        if (window.top.onContextMenu) {
            document.removeEventListener('contextmenu', onContextMenu);
            document.addEventListener('contextmenu', window.top.onContextMenu, false);
            
            window.addEventListener('mousedown', window.top.closeContextMenu, false);
            window.addEventListener('focus', window.top.closeContextMenu, false);
            e.target.addEventListener("focus",window.top.closeContextMenu);
            e.target.addEventListener("mousedown",window.top.closeContextMenu);

            return window.top.onContextMenu(e);
        }
    }
    
    document.addEventListener('contextmenu', onContextMenu, false);

}




function debugButtonTextFromFilename(filename) {
    return {   ".html"     : "view",
               ".json"     : "",
               ".markdown" : "view",
               ".md"       : "view" }
           [ filename.substr(filename.lastIndexOf(".")) ] || "debug";
}



function saveViaTempFile(oldfile,newfile,text,cb) {
    /*
    
    atomically save text to newfile, copying any permissions from oldfile
    
    oldfile can be the same as newfile (ie when not renaming)
    
    */
    
    // get filemode of existing file
    fs.stat(oldfile,function(notFound,existing){
        
        var fileMode = {mode: notFound ? parseInt('666',8) : existing.mode};

        var tempFile = oldfile+(Date.now().toString(36))+(Math.floor(Math.random()*4096).toString(36));
        
        fs.writeFile(tempFile,text,fileMode,function(err){

           if (err) return cb(err);
           
           fs.rename(tempFile,newfile,function(err){
                if (err) return ;

                if (oldfile!==newfile) {
                    return fs.unlink(oldfile,function(){
                        cb(undefined,oldfile,newfile);
                    });
                }

                cb(undefined,oldfile,newfile);
            });

        });    
        
    });

}
/*
 fileEditor(theme,file,app,append_html) is invoked in node.js to create an editor instance mapping a single browser to a file
 theme - the ace theme name (eg "chaos" or "dawn", "cobalt" etc)
 file - full/relative path to local file name (eg what is passed into fs.readFileSync()
 app - the express app object
 append_html - optional function or string to append to editor page body for whatever reason
 
 returns an object that allows access to:
    simple on('change'), on('open'), on('close') callbacks 
    text of file being edited
    

 note - in most cases the editing takes place via a websocket connection
      - editing can take place via a post mechanism if websockets fail for some reason
      
 
 todo: currently debug and serve functions are commented out.
  (serve should just serve the page being edited, debug wraps javascript into a blank html page to allow inspector to be opened and code to be accessed via console)
 
*/
function fileEditor(theme,file,app,append_html) {

    var
    file_uri=encodeURIPath(file),
    save_to_name=file,
    onchange,
    onclose,
    onopen,
    editor_mode="text",
    connects=[],
    fileText,
    ok       = '{"ok":true}',
    notOk    = '{"ok":false}';
    
    function rename_file(newName) {
        if (newName===file|| typeof changed!=='function') return notOk;
        save_to_name = newName;
        changed(fileText.value);
        
        if (connects.length>0) {
            var json = JSON.stringify ({renamed:newName,file:file});
            console.log("sending",json,"to",connects.length,"connections");
            connects.forEach(function(connect){
                connect.send(json);
            });
            
            // for new inplace clones, move the routes to the new name
            swizzleRoute.removeRoute(app,edited_http_prefix+file_uri);
            swizzleRoute.removeRoute(app,ws_prefix+file_uri);
            swizzleRoute.removeRoute(app,ace_single_file_edit_url+file_uri);
            
            app.post(edited_http_prefix+newName,editViaHTTPPost);
            app.ws(ws_prefix+newName,onNewWebSocket);
            app.get (ace_single_file_edit_url+newName,getEditorHtml);
            
        }
    }
    
    function delete_file (cb){
        connects.forEach(function(ws){
           try{ ws.close(); } catch(e){}
        });
        connects.splice(0,connects.length);
        swizzleRoute.removeRoute(app,edited_http_prefix+file_uri);
        swizzleRoute.removeRoute(app,ws_prefix+file_uri);
        swizzleRoute.removeRoute(app,ace_single_file_edit_url+file_uri);
        fs.unlink(file,cb);
    }
    
    function set_theme(value) { 
        theme = value;
        
        if (connects.length>0) {
            var json = JSON.stringify ({file:file, theme:theme});
            console.log("sending",json,"to",connects.length,"connections");
            connects.forEach(function(connect){
                connect.send(json);
            });
        }
    }
    
    function set_editor_mode(value) { 
        editor_mode = value;
        
        if (connects.length>0) {
            var json = JSON.stringify ({file:file, editor_mode:value});
            console.log("sending",json,"to",connects.length,"connections");
            connects.forEach(function(connect){
                connect.send(json);
            });
        }
    }

    function changed(text){
        
        saveViaTempFile(file,save_to_name,text,function(err){
            if (!err) {
                console.log("updated",save_to_name,text.length,"bytes");
                file=save_to_name;
                if (typeof onchange==='function') onchange(text,file);
            }
        }); 
    }
    
    function processEditPayload(payload,sender){
      
        if (payload.file===file && typeof payload.diff==='object') {
            fileText.update(payload.diff,sender.updateDiff);
            fileText.payload = payload;
            sender.send('{"diffAck":"'+payload.diff[2]+'"}');
        } else {
            console.log({payload:payload});
            sender.send(notOk);
        }
         
    }

    function editViaHTTPPost(req,res){
        return processEditPayload(req.body,res);
    }
    
    function onNewWebSocket(ws) {

          ws.updateDiff = function (diff,who) {
              ws.send(JSON.stringify({file:file,diff:diff}));
          };

          ws.on('message', function(msg) {
             processEditPayload(JSON.parse(msg),ws);
          });

          ws.on('close', function() {
             
             connects.remove(ws);
             console.log({closed:connects.map(function(ws,ix){return "ws#"+ix;})});

            if (ws.updateDiff) {
                fileText.removeEventListener("diff",ws.updateDiff);
                console.log({detached:"ws.updateDiff event for closed socket"});
                var updaters = fileText.connections(connects,'updateDiff');
                if (typeof onclose==='function') onclose(file,updaters);
            }

          });

          ws.on('error', function(err) {
             connects.remove(ws);
             console.log({error:err,connects:connects.map(function(ws,ix){return "ws#"+ix;})});
             
            if (ws.updateDiff) {
                fileText.removeEventListener("diff",ws.updateDiff);
                console.log({detached:"ws.updateDiff event for error'd socket"});
            }

          });

          fileText.addEventListener("diff",ws.updateDiff);
          connects.push(ws);
          var updaters = fileText.connections(connects,'updateDiff');

          if (typeof onopen==='function') onopen(file,ws,updaters);

    }
    
    function getEditorHtml(req,res) {

        var html = edit_html.htmlGenerator();
        
        
        //html.replace('src-noconflict/ace.js',ace_lib_base_url+'/src-min-noconflict/ace.js');

        html.replace(new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),'');

        html.append({
            ws_prefix     : ws_prefix,
            edited_http_prefix : edited_http_prefix,
            file          : file,
            file_uri      : file_uri,
            file_text     : fileText.value,
            theme         : theme,
            editor_mode   : 'text',// default to text until browser is loaded
        },"head");
        
        html.append(ace_lib_base_url+"/src-noconflict/ace.js","body");
        html.append(ace_lib_base_url+"/src-noconflict/ext-modelist.js","body");


        html.append ("/js/polyfills.min.js","head");
        html.append ("/js/extensions.min.js","head");

        html.append(doc_browser_shorthand);
        html.append(singleFileEditorBrowserCode);

        if (append_html) {
           html.append(append_html);
        }

        res.send(html.html);
 
    }
    
    function editorSetup(options,cb){
        
        
        fs.readFile(file,"utf8",function(err,txt){
            
            fileText = stringDiffRegex.diffPump(txt,undefined,true);
        
                fileText.addEventListener("change",changed);

                options.handler = getEditorHtml;

                app.post(edited_http_prefix+file_uri,editViaHTTPPost);
                app.ws(ws_prefix+file_uri,onNewWebSocket);
                
                cb();            
        });

    }
    
    function editorTeardown (options,cb) {
        swizzleRoute.removeRoute(app,edited_http_prefix+file_uri);
        swizzleRoute.removeRoute(app,ws_prefix+file_uri);
        delete options.handler;
        cb ();
    }
    
    // defer reading of file and creating internal objects until browser actually opens the file
    swizzleRoute(
        app,
        "get",ace_single_file_edit_url+file_uri,{
            setup      : editorSetup,
            teardown   : editorTeardown,
            permitUndo : true
        }
    );


    return Object.defineProperties({},{
        file     : { 
            get : function(){ 
                return file;
            },
            set : rename_file,
            enumerable : true,
            configurable: true 
        },
        delete   : { 
            value : delete_file,
            enumerable : true,
            configurable: true 
        },
        on       : {
            value  : function (e,fn) {
                if (typeof fn ==='function') {
                    switch (e) {
                        case "change": onchange = fn; break;
                        case "open":   onopen   = fn; break;
                        case "close":  onclose  = fn; break;
                    }
                }
            },
            enumerable   : true,
            configurable : true
        },
        text     : {
            set : function (value){
                fileText.value = value;
                fs.writeFile(file,fileText.value,function(err){
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
        },
        loaded   : { get : function (){return !!fileText ; } },
        theme    : { get : function (){return theme;}, set : set_theme },
        
        serve    : { value : function() {
            var url = ace_single_serve_dir_url(file);
            console.log("serving @ ",url);
            swizzleRoute.removeRoute(app,url);
            app.use(url,express.static(path.dirname(path.resolve(".",file))));
        } },
        unserve  : { value : function() {
            var url = ace_single_serve_dir_url(file);
            console.log("stopping serving @ ",url);
            swizzleRoute.removeRoute(app,url);
        } },
        
        editor_mode : { get : function (){return editor_mode;}, set : set_editor_mode },
        sha1     : { get : function (){return (fileText && fileText.payload ? fileText.payload.diff[2]  : fileText ? fileText.value.sha1 : ''); }},
        errors   : { get : function (){return (fileText && fileText.payload ? fileText.payload.errors   : 0); }},
        warnings : { get : function (){return (fileText && fileText.payload ? fileText.payload.warnings : 0); }},
        hints    : { get : function (){return (fileText && fileText.payload ? fileText.payload.hints    : 0); }}
    });

}

/*
  singleFileEditor() creates and serves an express app to edit a single file
  
*/

function editor_CLI_KeyLoop(url) {
    var readline = require('readline');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    
    console.log('opening '+url);
    child_process.spawn("xdg-open",[url]);
    process.stdin.on('keypress', function (str, key) {
            
        switch (true) {
            
            case key.ctrl && key.name === 'c' : 
            case key.ctrl && key.name === 'd' : 
            case key.ctrl && key.name === 'x' : 
            case key.name === 'q' : 
            case !key.ctrl && key.name === 'escape' :     
                return process.exit();
                
            case !key.ctrl && key.name==='space' :
                console.log('opening '+url);
                return child_process.spawn("xdg-open",[url]);
                
            default : 
            
            console.log("You pressed the "+str+" key");
            console.log();
            console.log(key);
            console.log();
                
        }
        
    });
}

var getEditorMasterHTML = require("./getEditorMasterHTML")(
    ace_directory_html,ace_editor_css_url,
    debugButtonTextFromFilename,editor_themes,
    editor_modes,ws_prefix,edited_http_prefix,ace_single_file_edit_url,
    ace_single_file_debug_url,ace_single_file_serve_url,
    ace_single_serve_dir_url,ace_single_serve_file_url,
    doc_browser_shorthand,
    ace_lib_base_url);


function singleFileEditor(theme,file,port,append_html) {

    var app = express();
    var expressWs = require('express-ws')(app);
    var faExpress = require('font-awesome-express')(app);
    
    

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



function multiFileEditor(theme,files,port,append_html) {

    var
    
    self = {} ,
    
    /*simple event listeners logic begins*/
    events={ change : [], close : [], open: [] },
    emit=function(e,args){
        var fns = events[e];
        if ( Array.isArray(fns) ) {
            fns.forEach(function(fn){
                //if (typeof fn==='function') 
                fn.apply(this,args);
            });
        }
    },
    addEventListener = function(e,fn) {
        if (typeof fn==='function') {
            var fns = events[e];
            if ( Array.isArray(fns) ) {
                fns.push(fn);
            }
        }
    },
    removeEventListener = function(e,fn) {

        var fns = events[e];
        if ( Array.isArray(fns) ) {

            if (typeof fn==='function') {
                fns.remove(fn);
            } else {
                if (fn===null) {
                    fns.splice(0,fns.length);
                }
            }

        }
    };
    /*simple event listeners logic ends*/
    
    var app = express();
    var expressWs = require('express-ws')(app);
    var faExpress = require('font-awesome-express')(app);

    app.use(remote_ip());
    app.use(favicon());
    app.use(require('body-parser').json());

    app.use(ace_lib_base_url,express.static(ace_dir));
    app.use(ace_editor_base_url,express.static(ace_editor_dir));
    //app.use(string_diff_src_url,express.static(string_diff_src_path));

    var editors = {};
    
    

    Function.startServer(app,function(){
        var listener = app.listen(port||0, function() {

            var 
            
            connected = {},
            ids=[],
            add_editor = function(file){
                 var editor_theme = typeof file ==='string' ? theme : file.theme;
                 var filename = typeof file ==='string' ? file : file.file;
                 var editor = fileEditor(editor_theme,filename,app,append_html);
                 editors[filename] = editor;
                 editor.on("change",function(){
                     var args = Function.args(arguments);
                     emit("change",[{file:editor.file,text:editor.text}]);
                     var msg={
                         file:    editor.file,
                         sha1:    editor.sha1,
                         size:    editor.text.length,
                         errors:  editor.errors,
                         warnings: editor.warnings,
                         hints:   editor.hints
                     };
                     ids.forEach(function(id){
                         connected[id].send(msg);
                     });
                 });
                 editor.on("open",function(x,ws,updaters){
                     emit("open",[{file:editor.file,text:editor.text}]);
                     var msg = {file:editor.file,windowCount:updaters.length};
                     ids.forEach(function(id){
                         connected[id].send(msg);
                     });
                 });
                 editor.on("close",function(x,updaters){
                     emit("close",[{file:editor.file}]);
                     var msg = {file:editor.file,windowCount:updaters.length};
                     ids.forEach(function(id){
                         connected[id].send(msg);
                     });
                 });
             };

            files.forEach(add_editor);

            app.get(
                        ace_multi_file_dashboard_url,
                        getEditorMasterHTML (
                            files, 
                            "editing files",
                            theme,
                            faExpress,
                            files.length>=1 ? 
                            function(editFile,files){
                                    editFile(Object.keys(files)[0]);
                            } : undefined
                        )
                    );

            function wsId(randDigits,msecDigits) {
                return ( Array(1+randDigits).join('z')+
                         Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(36)
                       ).substr(0-randDigits)+'-'+Date.now().toString(36).substr(0-msecDigits);
            }

            function wsAge(id) {
                var when   = Date.now();
                var ref    = when.toString(36);
                var len    = id.length - id.indexOf('-') - 1;
                var digits = id.replace(/.*-/,ref.substr(0,ref.length-len));
                return (when - Number.parseInt(digits,36))/1000;
            }

        /*    
           function wsIdAgeTest() {

                setTimeout(function(id){
                    var age = wsAge(id);
                    console.log("wsIdAgeTest():",id,"is",age.toFixed(3),"seconds old");
                    if (age < 1 || age > 1.100) {
                        throw new Error ("wsAge() self test failed");
                    }
                },1010,wsId(10,6));

            }

           wsIdAgeTest();*/

            app.use(function (req, res, next) {
                 req.ws_id =wsId(10,6);
                 return next();
            });

            app.ws(ws_prefix+"_index", function(ws,req) {
                  ws.id=req.ws_id;

                  connected[ws.id]=Object.defineProperties({},{
                      age  : { get : wsAge.bind(this,ws.id),enumerable:true },
                      last_active : {value : Date.now(), writable: true, enumerable:false },
                      active : {get : function(){return (Date.now()-this.last_active)/1000;},enumerable:true },
                      id   : {value : ws.id, writable: false, enumerable:true },
                      send : {value : function(obj) {
                          if (!this.connected) return;
                          try {
                            ws.send(JSON.stringify(obj));
                            console.log({sent:obj,id:ws.id});
                            this.last_active = Date.now();
                          } catch (err) {
                              console.log({error:err.message,id:ws.id});
                             this.connected=false; 
                          }
                         
                      }},
                      connected : {value : true, writable: true, enumerable:true },
                       
                  });
                  ids=Object.keys(connected);

                  console.dir({connected:connected[ws.id]},{getters:true,colors:true,depth:null});

                  ws.on('close', function() {
                        console.dir({closed:connected[ws.id]},{getters:true,colors:true,depth:null});
                        connected[ws.id].connected=false;
                        delete connected[ws.id];
                        ids=Object.keys(connected);
                  });

                  ws.on('error', function(err) {
                        console.dir({error:err,ws:connected[ws.id]},{getters:true,colors:true,depth:null});
                        connected[ws.id].connected=false;
                        delete connected[ws.id];
                        ids=Object.keys(connected);
                  });
                  
                  ws.on('message', function(msg) {
                      //if (!this.connected) return;
                      //this.last_active = Date.now();
                      try {
                          console.log({recv:msg,id:ws.id});
                          
                          var cmd = JSON.parse(msg),ed;
                          
                          
                          /*
                          
                           incoming file rename request from browser
                          
                          */
                          if ( cmd && 
                               typeof cmd.file==='string' && 
                               typeof cmd.renamed==='string' &&
                               (ed = editors[cmd.file])  
                             ) {
                                 
                             ed.file=cmd.renamed;
                             delete editors[cmd.file];
                             editors[cmd.renamed]=ed;
                             console.log("ping back:",msg);
                             ws.send(msg);
                         }
                          
                          
                          /*
                          
                           incoming file copy request from browser
                          
                          */
                          
                          if (  cmd && 
                                typeof cmd.file==='string' && 
                                typeof cmd.copied==='string' &&
                                (ed = editors[cmd.file]) 
                                ) {
                                    
                             var copy = ed.loaded ?
                             fs.writeFile.bind(fs,cmd.copied,ed.text) :
                             fs.copyFile.bind(fs,cmd.file,cmd.copied) ;
                             
                             copy (function(){
                                 add_editor(cmd.copied);
                                 console.log("ping back:",msg);
                                 ws.send(msg);
                             });
                             
                             
                          }
                          
                          
                          /*
                          
                           incoming new filerequest from browser
                          
                          */
                          
                          if (cmd && typeof cmd.new_file==='string') {
                              
                              fs.writeFile(cmd.new_file,cmd.text||'',function(){
                                 add_editor(cmd.new_file);
                                 ws.send(msg);
                              });
                             
                          }
                          
                          
                          /*
                          
                           incoming file delete request from browser
                          
                          */
                          
                          if ( cmd && 
                               typeof cmd.delete_file==='string'&&
                               (ed = editors[cmd.delete_file]) 
                             ) {
                              
                              ed.delete(function(err){
                                  
                                 if (err) console.log(err);
                                 console.log("ping back:",msg);
                                 
                                 files.remove(cmd.delete_file);
                                 
                                 ws.send(msg);
                                 
                              });
                             
                          }
                          
                          
                          
                          /*
                          
                           incoming editor theme change from browser
                          
                          */
                          
                          if (  cmd && 
                                typeof cmd.file==='string' && 
                                typeof cmd.theme==='string' &&
                                (ed = editors[cmd.file]) 
                                ) {
                                    
                                // new editor windows for this file will have the updated theme
                                ed.theme = cmd.theme;
                                
                                // confirm / notify other windows;
                                ws.send(msg);
                                
                          }
                          
                          
                          /*
                          
                           incoming editor theme change from browser
                          
                          */
                          
                          if (  cmd && 
                                typeof cmd.default_theme==='string' 
                             ) {
                                    
                                // new editor windows for this file will have the updated theme
                                
                                console.log("updated:",theme,'--->',cmd.default_theme);
                                theme = cmd.default_theme;
                                
                                
                                // confirm / notify other windows;
                                ws.send(msg);
                                
                          }
                          
                          
                          
                          
                          
                          
                          
                          /*
                          
                           incoming editor mode change from browser
                          
                          */
                          
                          if (  cmd && 
                                typeof cmd.file==='string' && 
                                typeof cmd.editor_mode==='string' &&
                                (ed = editors[cmd.file]) 
                                ) {
                                    
                                // new editor windows for this file will have the updated mode
                                ed.editor_mode = cmd.editor_mode;
                                
                                // confirm / notify other windows;
                                ws.send(msg);
                                
                          }
                          
                          
                          /*
                          
                           incoming editor serve / unserve from browser
                          
                          */
                          
                          if (  cmd && 
                                typeof cmd.file==='string' && 
                                typeof cmd.serve==='boolean' &&
                                (ed = editors[cmd.file]) 
                                ) {
                                    
                                    
                                if (cmd.serve) {
                                    ed.serve();
                                } else {
                                    ed.unserve();
                                }
                                // confirm / notify other windows;
                                ws.send(msg);
                                
                          }
                          
                          
                          
                          
                          //fn (JSON.parse(msg))
                      } catch (e) {
                        console.log({ouch:e});
                      }
                  });

            });

            var url =  'http://'+hostname+':' + listener.address().port+ace_multi_file_dashboard_url;
            
            editor_CLI_KeyLoop(url);
            

        });
    });

    return Object.defineProperties(self,{
        files               : { value : editors, enumerable:true},
        addEventListener    : { value : addEventListener , enumerable:true} ,
        removeEventListener : { value : removeEventListener, enumerable:true},
    });
}

function nodeCLI(argv) {

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

}

Object.defineProperties(acelib,{
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
        demo_html=theme? demo_html_raw.split('ace/theme/twilight').join('ace/theme/'+theme) : demo_html_raw;
        var app;
        ace.express(app=express());
        var listener = app.listen(port||3000, function() {
            var url =  'http://'+hostname+':' + listener.address().port+ace_lib_base_url+"/editor.html";
            console.log('goto '+url);
            child_process.spawn("xdg-open",[url]);
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

module.exports = acelib;

if (process.mainModule===module && process.argv.length>2) {
    nodeCLI(process.argv);
}
