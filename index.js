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

ace_single_file_open_url = "/ace/edit",

ace_single_file_edit_url = "/ace/editing/",
ace_single_file_debug_url = "/ace/debuging/",
ace_single_file_serve_url = "/ace/serving/",



ace_multi_file_dashboard_url = "/ace/edit",

ace_directory_row_re = new RegExp('<tr class="template_row.*<\/tr>','s'),
ace_directory_html_raw= String.load(ace_directory_html_path),
ace_directory_html= ace_directory_html_raw.replace(ace_directory_row_re,''),
ace_directory_html_template =
    ace_directory_row_re.exec(ace_directory_html_raw)[0]
       .replace(/<tr class="template_row.*>/,'<tr>'),

ace_dir         = path.join(path.dirname(ace_file),".."),
edit_html       = fs.readFileSync(ace_editor_html_path,"utf8"),
debug_html       = fs.readFileSync(ace_editor_debug_path,"utf8"),
demo_html_raw   = fs.readFileSync(path.join(ace_dir,"editor.html"),"utf8"),
demo_html       = demo_html_raw,
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
hostname = require("get-localhost-hostname");

//nb this func is never invoked, it's just used to
//hold the source that is injected into the html
// the "arguments" here are just for linting purposes
// they exist as vars in the outer scope which this code is
// injected into.
function singleFileEditorBrowserCode(editor,file,file_text,editor_mode,theme,ws_prefix){
    Function.load("string-diff-regex",function(stringDiffRegex){
        var

        editor = ace.edit("editor"),

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

            var updateWS = function (payload){
                timeout=false;
                if (wsBusy) {
                    timeout = setTimeout(updateWS,50);
                    return;
                }
                wsBusy=true;
                document.title = file + "+";
                updating = true;
                payload=payload||{};
                payload.file=file;
                payload.value=editor.getValue();
                ws.send(JSON.stringify(payload));
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
                   }
               }

            };

            ws.onclose = function() {
               document.location.reload();
            };

            var updateWSPump = function (payload){
                timeout=false;
                if (wsBusy) {
                    timeout = setTimeout(updateWSPump,50);
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
                errors:document.querySelectorAll("#editor div .ace_error").length,
                warnings:document.querySelectorAll("#editor div .ace_warning").length,
                hints:document.querySelectorAll("#editor div .ace_hint").length
            };

            if (timeout) clearTimeout(timeout);
            if (payload.errors > 0 && ((!last_payload) || (last_payload && last_payload.errors!==payload.errors))) {
                document.title = file + "? (errors)";
                timeout=setTimeout(updateProcErrorCheckWrap,msec,Math.max(msec*2,5000),payload);
            } else {
                if ( payload.warnings+payload.errors  > 0) {
                    document.title = file + (updating ? "+" : "*")+ " "+payload.warnings+payload.errors + " warnings/errors";
                } else {
                    document.title = file + (updating ? "+" : "*");
                }
                timeout=setTimeout(updateProc,5,payload);
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
               ".json":"json",
               ".md" : "markdown",
               ".markdown" : "markdown"}
           [ filename.substr(filename.lastIndexOf(".")) ] || "javascript";
}

function debugButtonTextFromFilename(filename) {
    return {   ".html" : "view",
               ".json" : "",
               ".markdown" : "view",
               ".md"   : "view" }
           [ filename.substr(filename.lastIndexOf(".")) ] || "debug";
}

/*
    dont' invoke getEditorMasterHTML() directly. it is called 
    by singleFileEditor() and multiFileEditor() which set up the node js related aspects of the editor

    getEditorMasterHTML(files,title,theme) returns a handler for an express app
    the handler that is returned is a function that is invoked which generates 
    the html page which contains the file tree menu, with an editor in a side panel 
    files - an array of strings or objects (filenames or eg {file:"filename.js",theme:"chaos"})
    title - the html page title for the editor
    theme - those files without specific theme get the generic theme from the theme arg
    
    note - the side panel editor is an embedded html object, which is in turn generated by a 
    // handler that is managed via the fileEditor() function
*/
function getEditorMasterHTML (files,title,theme) {
    
    // the code inside masterHTMLBrowserCode() is injected  into the html page
    // returned by the handler. it's in this scope purely for linting purposes
    // and is converted to a string for injection prior to being returned.
    function masterHTMLBrowserCode() {
        
        var file_index;
        
        function setupSplitter() {
            
            (function () {
            
                /**
                 * THIS OBJECT WILL ONLY WORK IF your target is positioned relative or absolute,
                 * or anything that works with the top and left css properties (not static).
                 *
                 * Howto
                 * ============
                 *
                 * document.getElementById('my_target').sdrag();
                 *
                 * onDrag, onStop
                 * -------------------
                 * document.getElementById('my_target').sdrag(onDrag, null);
                 * document.getElementById('my_target').sdrag(null, onStop);
                 * document.getElementById('my_target').sdrag(onDrag, onStop);
                 *
                 * Both onDrag and onStop callback take the following arguments:
                 *
                 * - el, the currentTarget element (#my_target in the above examples)
                 * - pageX: the mouse event's pageX property (horizontal position of the mouse compared to the viewport)
                 * - startX: the distance from the element's left property to the horizontal mouse position in the viewport.
                 *                  Usually, you don't need to use that property; it is internally used to fix the undesirable
                 *                  offset that naturally occurs when you don't drag the element by its top left corner
                 *                  (for instance if you drag the element from its center).
                 * - pageY: the mouse event's pageX property (horizontal position of the mouse compared to the viewport)
                 * - startY: same as startX, but for the vertical axis (and element's top property)
                 *
                 *
                 *
                 * The onDrag callback accepts an extra argument: fix.
                 *
                 * fix is an array used to fix the coordinates applied to the target.
                 *
                 * It can be used to constrain the movement of the target inside of a virtual rectangle area for instance.
                 * Put a variable in the fix array to override it.
                 * The possible keys are:
                 *
                 * - pageX
                 * - startX
                 * - pageY
                 * - startY
                 * - skipX
                 * - skipY
                 *
                 * skipX and skipY let you skip the updating of the target's left property.
                 * This might be required in some cases where the positioning of the target
                 * is automatically done by the means of other css properties.
                 *
                 * 
                 *
                 *
                 *
                 *
                 * Direction
                 * -------------
                 * With direction, you can constrain the drag to one direction only: horizontal or vertical.
                 * Accepted values are:
                 *
                 * - <undefined> (the default)
                 * - vertical
                 * - horizontal
                 *
                 *
                 *
                 *
                 */
            
                // simple drag
                function sdrag(onDrag, onStop, direction) {
            
                    var startX = 0;
                    var startY = 0;
                    var el = this;
                    var dragging = false;
            
                    function move(e) {
            
                        var fix = {};
                        onDrag && onDrag(el, e.pageX, startX, e.pageY, startY, fix);
                        if ('vertical' !== direction) {
                            var pageX = ('pageX' in fix) ? fix.pageX : e.pageX;
                            if ('startX' in fix) {
                                startX = fix.startX;
                            }
                            if (false === ('skipX' in fix)) {
                                el.style.left = (pageX - startX) + 'px';
                            }
                        }
                        if ('horizontal' !== direction) {
                            var pageY = ('pageY' in fix) ? fix.pageY : e.pageY;
                            if ('startY' in fix) {
                                startY = fix.startY;
                            }
                            if (false === ('skipY' in fix)) {
                                el.style.top = (pageY - startY) + 'px';
                            }
                        }
                    }
            
                    function startDragging(e) {
                        if (e.currentTarget instanceof HTMLElement || e.currentTarget instanceof SVGElement) {
                            dragging = true;
                            var left = el.style.left ? parseInt(el.style.left) : 0;
                            var top = el.style.top ? parseInt(el.style.top) : 0;
                            startX = e.pageX - left;
                            startY = e.pageY - top;
                            window.addEventListener('mousemove', move);
                        }
                        else {
                            throw new Error("Your target must be an html element");
                        }
                    }
            
                    this.addEventListener('mousedown', startDragging);
                    window.addEventListener('mouseup', function (e) {
                        if (true === dragging) {
                            dragging = false;
                            window.removeEventListener('mousemove', move);
                            onStop && onStop(el, e.pageX, startX, e.pageY, startY);
                        }
                    });
                }
            
                Element.prototype.sdrag = sdrag;
            })();
           
           var leftPane = document.getElementById('left-pane');
           var rightPane = document.getElementById('editor');
           var paneSep = document.getElementById('panes-separator');
       
           // The script below constrains the target to move horizontally between a left and a right virtual boundaries.
           // - the left limit is positioned at 10% of the screen width
           // - the right limit is positioned at 90% of the screen width
           var leftLimit = 10;
           var rightLimit = 90;
       
       
           paneSep.sdrag(function (el, pageX, startX, pageY, startY, fix) {
       
               fix.skipX = true;
       
               if (pageX < window.innerWidth * leftLimit / 100) {
                   pageX = window.innerWidth * leftLimit / 100;
                   fix.pageX = pageX;
               }
               if (pageX > window.innerWidth * rightLimit / 100) {
                   pageX = window.innerWidth * rightLimit / 100;
                   fix.pageX = pageX;
               }
       
               var cur = pageX / window.innerWidth * 100;
               if (cur < 0) {
                   cur = 0;
               }
               if (cur > window.innerWidth) {
                   cur = window.innerWidth;
               }
       
       
               var right = (100-cur-2);
               leftPane.style.width = cur + '%';
               rightPane.style.width = right + '%';
               
               if (rightPane.children[0] && !rightPane.children[0].hidden) {
                    rightPane.children[0].hidden=true;   
               }
               
       
           }, 
           
           function () {
             if(rightPane.children[0]) rightPane.children[0].hidden=false;
           }
           , 'horizontal');
       
       
           
           
        }
        
        
        
        function resolveFile(file) {
            if (typeof file==='object' && file.target) {
                if (file.preventDefault) file.preventDefault();
                if (file.stopImmediatePropagation) file.stopImmediatePropagation();
                return file.target.dataset.fileEdit;
            }
            return file;
        }


        function editFile (file) {
            document.getElementById("editor").innerHTML='<object type="text/html" data="'+ace_single_file_edit_url+resolveFile(file)+'"></object>'
        }

        function openFile (file) {
            window.open(ace_single_file_edit_url+resolveFile(file),"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
        }

        function debugFile (file) {
            window.open(ace_single_file_debug_url+resolveFile(file),"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
        }

        function serveFile (file) {
            window.open(ace_single_file_serve_url+resolveFile(file),"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
        }
        
        function sub(files, dir) {
          var dir_len = dir.length;
          return files
            .filter(function(fn) {
              return fn.startsWith(dir);
            })
            .map(function(fn) {
              return fn.substr(dir_len);
            });
        }
        
        function topFiles(files) {
          return files
            .map(function(fn) {
              var i = fn.indexOf("/");
              return i < 0 ? fn : fn.substr(0, i + 1);
            })
            .filter(function(fn, ix, ar) {
              return ar.indexOf(fn) === ix;
            })
            .map(function(fn) {
              if (fn.endsWith("/")) {
                var subfiles = sub(files, fn);
                return { dir: fn.substr(0, fn.length - 1), files: topFiles(subfiles) };
              } else {
                return fn;
              }
            });
        }
        
        function dirHtml(files, ids, cb, root, ind) {
          root = root || "";
          ind = ind || "";
          var h = "";
          files.forEach(function(f) {
            var i = "f_" + (Object.keys(ids).length + 1).toString(36);
            if (typeof f === "string") {
              ids[i] = root + f;
              h += ind + '<input type="radio" name="hosted_files" id="'+i+'" value="'+f+'">\n';
              h += ind + '<label onclick="' + cb + '(this.htmlFor);" for="'+i+'">'+f+"</label>\n";
            } else {
              var dir = root + f.dir;
              ids[i] = dir;
        
              h += ind + '<input type="checkbox" id="' + i + '">\n';
              h += ind + '<label for="' + i + '">' + f.dir + "</label>\n";
              h += ind + '<div class="dir_wrapper">\n';
              h += dirHtml(f.files, ids, cb, root + f.dir + "/", ind + " ");
              h += ind + "</div>\n";
            }
          });
          return h;
        }
        
        function loadfiles(el, files, cb) {
          var ids = {};
          var list = topFiles(files);
          var html = dirHtml(list, ids, cb);
        
          el.innerHTML = html;
          return ids;
        }
        
        function fileTreeClick(id) {
            editFile (file_index[id]);
        }
        
        function setupMenu () {
            
            var 
            
            menu = document.querySelector('.menu'),
            currentFile;
            
            
            document.getElementById("menu_file_open").addEventListener("mousedown",function(){
                if (currentFile) {
                    editFile(currentFile);
                }
            },false);
            
            
            document.getElementById("menu_file_open_new").addEventListener("mousedown",function(){
                if (currentFile) {
                    openFile(currentFile);
                }
            },false);
            
            document.getElementById("menu_file_debug").addEventListener("mousedown",function(){
                if (currentFile) {
                    debugFile(currentFile);
                }
            },false);
            
            document.getElementById("menu_file_serve").addEventListener("mousedown",function(){
                if (currentFile) {
                    serveFile(currentFile);
                }
            },false);
            
            function showMenu(x, y){
                menu.style.left = x + 'px';
                menu.style.top = y + 'px';
                menu.classList.add('menu-show');
            }
            
            function hideMenu(){
                menu.classList.remove('menu-show');
            }
            
            function onContextMenu(e){
                console.log(e.target);
                e.preventDefault();
                if (e.target && e.target.htmlFor && file_index[e.target.htmlFor] && (currentFile = file_index[e.target.htmlFor]) ) {
                    
                    showMenu(e.pageX, e.pageY);
                    document.addEventListener('mousedown', onMouseDown, false);
                } else {
                    currentFile=null;
                }
            }
            
            function onMouseDown(e){
                hideMenu();
                document.removeEventListener('mousedown', onMouseDown);
            }
            
            document.addEventListener('contextmenu', onContextMenu, false);
            
        }
        
        file_index = loadfiles(document.querySelector(".file_tree"), Object.keys(files), "fileTreeClick");
        
        setupSplitter();
        setupMenu ();

        document.querySelectorAll("[data-file-edit]").forEach(
            function(btn) {
                btn.addEventListener("click",editFile);
            }
        );

        document.querySelectorAll("[data-file-debug]").forEach(
            function(btn) {
                btn.addEventListener("click",debugFile);
            }
        );

        document.querySelectorAll("[data-file-serve]").forEach(
            function(btn) {
                btn.addEventListener("click",serveFile);
            }
        );

        var
        ws = new WebSocket("ws://" + location.host + ws_prefix+"_index");
        ws.onopen = function() {

           // Web Socket is connected, send data using send()
          // ws.send('{"open":true}');
        };

        ws.onmessage = function (evt) {
           var payload = JSON.parse(evt.data);

           var file,
               id_prefix="dir_"+payload.file.sha1+"_",
               update=function(k) {
                 if (payload[k]) {
                    document.getElementById(id_prefix+k).innerHTML=(file[k]=payload[k]).toString();
                 }
               };
           if (payload.file && (file=files[payload.file]) ) {

                payload.errwarn=(payload.errors||"0")+"/"+(payload.warnings||"0");

                update("size");
                update("mtime");
                update("sha1");
                update("windowCount");
                update("errwarn");

           }
        };

        ws.onclose = function() {
           //document.location.reload();
        };

    }

    function getFiles () {
        var fileIndex = {};
        files.forEach(function(file){
            var filename = typeof file ==='string' ? file : file.file;
            var editor_theme = typeof file ==='string' ? theme : file.theme;
            var editor_mode  = modeFromFilename(filename);
            var debug_text   = debugButtonTextFromFilename(filename);
            var stats = fs.statSync(path.resolve(filename));

            try {
                fileIndex[filename]= {
                    id    : filename.sha1,
                    file  : filename,
                    size: stats.size,
                    mtime: stats.mtime,
                    theme: editor_theme,
                    mode : editor_mode,
                    debug : debug_text,
                    windowCount : 0,
                    sha1 : "",
                    errwarn : "?"
            };
            } catch (e) {
                fileIndex[filename]= {
                    id    : filename.sha1,
                    file  : filename,
                    size  : 0,
                    mtime : new Date(0),
                    theme : editor_theme,
                    mode : editor_mode,
                    debug : debug_text,
                    windowCount : 0,
                    sha1 : "",
                    errwarn : ""
                };
            }
        });

        return fileIndex;
    }

    return function getEditLaunchHtml(req,res) {

        // get an html generator (from String extension in jsextensions)
        var html =  ace_directory_html.htmlGenerator();

        html.append(ace_editor_css_url);
        html.append(title,"title");
        var filesNow = getFiles ();
        
        // append the vars that the page needs using Object.varify()
        // note - the files object is a snapshot at page load.
        // it gets updated in memory as things change. so looking at page source in browser will 
        // show the files as and when the page was first loaded. as edits are made, the 
        // file sizes and sha1 hashses etc get updated in memory.
        html.append({
            ws_prefix : ws_prefix,
            ace_single_file_edit_url : ace_single_file_edit_url,
            ace_single_file_debug_url : ace_single_file_debug_url,
            ace_single_file_serve_url : ace_single_file_serve_url,
            files : filesNow
        },"head");

        html.append(
          ace_directory_html_template.renderWithObject(Object.values(filesNow)),
          "table"
        );

        html.append(masterHTMLBrowserCode,"body");
        res.send(html.html);
    };
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
    onchange,
    onclose,
    onopen,
    connects=[],
    fileText;
    
    function editorSetup(options,cb){
        
        fileText = stringDiffRegex.diffPump(fs.readFileSync(file,"utf8"),undefined,true);
        var
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
                    fileText.payload = payload;
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
    
            html.replace('src-noconflict/ace.js',ace_lib_base_url+'/src-min-noconflict/ace.js');
    
            html.replace(new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),'');
    
            fs.stat(file,function(err,stat){
                if (!err && stat) {
                    fs.readFile(file,"utf8",function(err,text){
                        if (!err && typeof text==='string') {
                            fileText.value = text;
    
                            html.append({
                                ws_prefix    : ws_prefix,
                                file         : file,
                                file_text    : fileText.value,
                                theme        : theme,
                                editor_mode  : modeFromFilename(file),
                            },"head");
    
                            html.append ("/js/polyfills.min.js","head");
                            html.append ("/js/extensions.min.js","head");
    
    
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
    /*
        function getDebugJS (req,res){
            fs.stat(file,function(err,stat){
                if (!err && stat) {
                    /*
                    var html = debug_html.htmlGenerator();
    
                    html.append({
                        ws_prefix    : ws_prefix,
                        file         : file,
                    },"head");
                    *//*
                    res.send(debug_html.renderWithObject({file:file}));
                } else {
                    res.send ("can't serve file "+file+". sorry."+(err?"\n"+err.message:""));
                }
    
            });
        }
    
        function getDebugMD (req,res){
            fs.stat(file,function(err,stat){
                if (!err && stat) {
                    fs.readFile(file,"utf8",function(err,text){
                        if (!err && typeof text==='string') {
    
                            var html = md2html(text).htmlGenerator();
    
                            html.append({
                                ws_prefix    : ws_prefix,
                                file         : file,
                            },"head");
    
                            html.append(singleFileEditorBrowserCode);
    
                            res.send(html.html);
                        } else {
                            res.send ("can't serve file "+file+". sorry."+(err?"\n"+err.message:""));
                        }
                    });
    
                } else {
                    res.send ("can't serve file "+file+". sorry."+(err?"\n"+err.message:""));
                }
            });
        }
        
        */
    
        options.handler = getEditorHtml;
        //app.get(ace_single_file_edit_url+file,getEditorHtml);
    
        /*
        app.get(ace_single_file_debug_url+file,
    
            file.endsWith('.js') ? getDebugJS :
            file.endsWith('.md')||file.endsWith('.markdown')  ? getDebugMD : function(req,res) {
                res.redirect(ace_single_file_serve_url+file);
            });
    
        app.use(ace_single_file_serve_url,express.static(path.resolve(".")));
        */
    
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
    
        });
        cb();
    }
    
    // defer reading of file and creating internal objects until browser actually opens the file
    swizzleRoute(
        app,
        "get",ace_single_file_edit_url+file,
        {setup:editorSetup}
    );


    return Object.defineProperties({},{
        file : {value : file,enumerable : true,configurable: true },
        on : {
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
        text : {
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
        sha1     : { get : function (){return (fileText.payload ? fileText.payload.diff[2] : fileText.value.sha1); }},
        errors   : { get : function (){return (fileText.payload ? fileText.payload.errors   : 0); }},
        warnings : { get : function (){return (fileText.payload ? fileText.payload.warnings : 0); }},
        hints    : { get : function (){return (fileText.payload ? fileText.payload.hints    : 0); }}
    });

}


/*

  singleFileEditor() creates and serves an express app to edit a single file
  
  
*/
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
        var url =  'http://'+hostname+':' + listener.address().port+ ace_single_file_open_url + "/"+file;
        console.log('goto '+url);
        child_process.spawn("xdg-open",[url]);
    });

    app.get(ace_single_file_open_url+"/"+file,getEditorMasterHTML ([file],file,theme));

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
                var ix = fns.indexOf(fn);
                if (ix>=0) fns.splice(ix,1);
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

    app.use(remote_ip());
    app.use(favicon());
    app.use(require('body-parser').json());

    app.use(ace_lib_base_url,express.static(ace_dir));
    app.use(ace_editor_base_url,express.static(ace_editor_dir));
    //app.use(string_diff_src_url,express.static(string_diff_src_path));

    var editors = {};

    Function.startServer(app,function(){
        var listener = app.listen(port||0, function() {

            var connected = {},ids=[];

            files.forEach(function(file){
                var editor_theme = typeof file ==='string' ? theme : file.theme;
                var filename = typeof file ==='string' ? file : file.file;
                var editor = fileEditor(editor_theme,filename,app,append_html);
                editors[filename] = editor;
                editor.on("change",function(){
                    var args = Function.args(arguments);
                    emit("change",[{file:editor.file,text:editor.text}]);
                    var msg={
                        file:    filename,
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
                    var msg = {file:filename,windowCount:updaters.length};
                    ids.forEach(function(id){
                        connected[id].send(msg);
                    });
                });
                editor.on("close",function(x,updaters){
                    emit("close",[{file:editor.file}]);
                    var msg = {file:filename,windowCount:updaters.length};
                    ids.forEach(function(id){
                        connected[id].send(msg);
                    });
                });
            });

            app.get(ace_multi_file_dashboard_url,getEditorMasterHTML (files, "editing files",theme) );

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
                      active : {get : function(){return (Date.now()-this.last_active)/1000},enumerable:true },
                      id   : {value : ws.id, writable: false, enumerable:true },
                      send : {value : function(obj) {
                          if (!this.connected) return;
                          ws.send(JSON.stringify(obj));
                          console.log({sent:obj,id:ws.id});
                          this.last_active = Date.now();
                      }},
                      connected : {value : true, writable: true, enumerable:true },
                      onmsg : { value : function(fn) {
                        ws.on('message', function(msg) {
                            if (!this.connected) return;
                            this.last_active = Date.now();
                            try {
                                console.log({recv:msg,id:ws.id});
                                fn (JSON.parse(msg))
                            } catch (e) {

                            }
                        });
                      }}
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

            });

            var url =  'http://'+hostname+':' + listener.address().port+ace_multi_file_dashboard_url;
            console.log('goto '+url);
            child_process.spawn("xdg-open",[url]);

        });
    });

    return Object.defineProperties(self,{
        files               : { value : editors, enumerable:true},
        addEventListener    : { value : addEventListener , enumerable:true} ,
        removeEventListener : { value : removeEventListener, enumerable:true},
    });
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
                        files=files.concat(fs.readdirSync(dirname,{recursive:true}).map(file_path_mapper))
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
        demo_html=theme? demo_html_raw.split('ace/theme/twilight').join('ace/theme/'+theme) : demo_html_raw;
        var app;
        ace.express(app=express());
        var listener = app.listen(port||3000, function() {
            var url =  'http://'+hostname+':' + listener.address().port+ace_lib_base_url+"/editor.html"
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

module.exports = ace;

if (process.mainModule===module && process.argv.length>2) {
    console.log(new Error());
    nodeCLI(process.argv);
}
