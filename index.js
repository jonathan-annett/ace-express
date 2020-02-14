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


ace_multi_file_dashboard_url = "/ace/edit",

ace_directory_html= String.load(ace_directory_html_path),

ace_dir         = path.join(path.dirname(ace_file),".."),
editor_theme_re = /(^theme-)(?<theme>.*)(\.js$)/,
editor_themes = fs.readdirSync(path.join(ace_dir,"src"))
    .filter(function(fn){
         return !!editor_theme_re.exec(fn); 
    })
    .map(function(fn){
        return editor_theme_re.exec(fn).groups.theme;
    }),
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
ace = {};


console.log({editor_themes});

 
function encodeURIPath(f) {
    return f.split("/").map(encodeURIComponent).join("/");
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

function fullscreen_launcher (
   // set by doc_browser_shorthand ()
    doc,docMeth,docWrite,getEl,qrySel,qryAll,docEl  
) {

    if (window.toolbar.visible) {
        
        docWrite('<div><div class="centered"><button class="launch_button" id="btnWindowed">in Window</button><button class="launch_button" id="btnFullScreen">FullScreen</button></div></div><!--');
        
        var 
        fs_keydown=function(e){
            if(e.key === "Escape") {
                window.close();
            }
        },
        launchBtn=function(id,suffix) {
            var goBtn = getEl(id);
            goBtn.onclick=function (e) {
                  e.preventDefault();
                  window.removeEventListener("keydown",fs_keydown);
                  window.open(window.location.href+suffix,"_blank","scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
                  window.close();
            };
            return goBtn;
        };
        
        launchBtn("btnFullScreen","?fs=1");
        launchBtn("btnWindowed","").focus(); 
        
        window.addEventListener("keydown",fs_keydown);
        

    } else {
        docEl.classList.remove("startup");
    }
    
}


//nb this func is never invoked, it's just used to
//hold the source that is injected into the html
// the "arguments" here are just for linting purposes
// they exist as vars in the outer scope which this code is
// injected into.
function singleFileEditorBrowserCode(
    // set by doc_browser_shorthand ()
    doc,docMeth,docWrite,getEl,qrySel,qryAll,docEl,
    editor,file,file_text,editor_mode,theme,ws_prefix,edited_http_prefix){
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
                   } else {
                       if (payload.file===file && typeof payload.renamed==='string') {
                           file = payload.renamed;
                           document.title = file;
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

        editor.getSession().on('change', function() {
            if (blockChanges) return;
            if (timeout) clearTimeout(timeout);
            document.title = file + (updating ? "?" : "*");
            timeout=setTimeout(updateProcErrorCheckWrap,update_check_interval,update_fallback_interval);
        });


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

function masterHTMLBrowserCode(
    // the code inside masterHTMLBrowserCode() is injected  into the html page
    // returned by the handler. it's in this scope purely for linting purposes
    // and is converted to a string for injection prior to being returned.
    // effecctively by declaring this function (technically a javascript object) here
    // it acts as a quasi repository

    //these 'vars' are declared elswhere
    files,doc,getEl,docEl,qrySel,qryAll,default_theme
) {
  
    var 
    
    menu,
    is_fs_menu = window.top===window && location.search.search(/(\?|&)fs=1(&|$)/)>=0;
  
    docEl.addEventListener('fullscreenchange', function (event) {
      if (!document.fullscreenElement) {
          
          var ed = getEl("editor");
          if (ed.dataset.is_full) {
             if (!menuShowing()) {
                 delete ed.dataset.is_full;
                 leftPane.style.display="block";
                 paneSep.style.display="block";
                 if (is_fs_menu) {
                    docEl.requestFullscreen(); 
                 }
             
             } else {
                 hideMenu();
                 docEl.requestFullscreen(); 
             }
          } else {
              if (is_fs_menu) {
                window.close();
              }
          }
      }
    });
    
    if (is_fs_menu) {

        var 
        banner = qrySel(".click_for_fullscreen"),
        gofull = function (){
            window.removeEventListener('mousedown',gofull);    
            docEl.requestFullscreen(); 
            banner.style.display="none";
        };
        window.addEventListener('mousedown',gofull);
        banner.style.display="block";
        
    }
    
    var 
    menu_ws,
    file_index,
    leftPane,rightPane,paneSep,
    file_tree= qrySel(".file_tree");
    
    function getChecked(el,typ) {
        var chks = el.querySelectorAll('input[type='+(typ||"checkbox")+']'); 
        return [].filter.call( chks, function( el ) {
           return el.checked
        }).map(function(el){return el.id});
    }
    
    function setChecked(id) {
        var el = getEl(id);
        if (el) el.checked=true;
    }
    
 
    
    function confirmChecked(filename) {
        var lookup = Object.values(file_index);
        var index = lookup.indexOf(filename);
        if (index<0) return filename;
        var states = getChecked(file_tree);
        Object.keys(file_index).forEach(function(k,ix){
            var el = getEl(k);
            if (ix===index) el.checked=true;
            var label = el.labels[0];
            label.contentEditable = 'false';
            label.onfocus = null;
            label.onblur=null;
            
            var dir = el.parentElement.parentElement.children[0];
            if (dir) dir.checked=true;
            
        });
        states.forEach(setChecked);
        return filename;
    }
    
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
                    if(onDrag) onDrag(el, e.pageX, startX, e.pageY, startY, fix);
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
                        if(onStop) onStop(el, e.pageX, startX, e.pageY, startY);
                    }
                });
            }
        
            Element.prototype.sdrag = sdrag;
        })();
       
       leftPane  = getEl('left-pane');
       rightPane = getEl('editor');
       paneSep   = getEl('panes-separator');
   
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
       },
       'horizontal');
   
   
       
       
    }
    
    function resolveFile(file) {
        if (typeof file==='object' && file.target) {
            if (file.preventDefault) file.preventDefault();
            if (file.stopImmediatePropagation) file.stopImmediatePropagation();
            return file.target.dataset.fileEdit;
        }
        return file;
    }
    
    function encodeURIPath(f) {
        return f.split("/").map(encodeURIComponent).join("/");
    }

    function editFile (file) {
        if (editFile.current === file) return;
        editFile.current=file;
        getEl("editor").innerHTML='<object type="text/html" data="'+ace_single_file_edit_url+encodeURIPath(confirmChecked(resolveFile(file)))+'"></object>';
    }
    
    function windowOpen (prefix,file,suffix) {
        window.open(prefix+resolveFile(file)+(suffix?suffix:''),"_blank", "scrollbars=1,fullscreen=yes,status=no,toolbar=no,menubar=no,location=no");
    }
    
    function openFile (file) {
        windowOpen (ace_single_file_edit_url,file);
    }
    
    function openFullscreen (file) {
        windowOpen (ace_single_file_edit_url,file,"?fs=1");
    }

    function debugFile (file) {
        windowOpen (ace_single_file_debug_url,file);
    }

    function serveFile (file) {
        windowOpen (ace_single_file_serve_url,file);
    }
    
    function relativeRename(oldname,newname) {
        var parts=oldname.split("/");
        if (parts.length===1) return newname;
        parts[parts.length-1]=newname;
        return parts.join("/");
    }
    
    function doRenameFile(oldname,newname) {
        if (oldname!==newname) {
            if (menu_ws && typeof menu_ws.send==='function') {
                menu_ws.send(JSON.stringify({file:oldname,renamed:newname}));
            }
        }
    }
    
    function renameFile(file,cb) {
        
        var 
        filename = resolveFile(file),
        lookup = Object.values(file_index),
        index = lookup.indexOf(filename);
        
        if (index<0) return ;
        
        var 
        keys  = Object.keys(file_index),
        label = qrySel('label[for="'+keys[index]+'"]');
        
        if (editFile.current===filename) {
            confirmChecked(editFile.current);
        }

        label.contentEditable = 'true';
        
        function blurred() {
            label.contentEditable = 'false';
            label.onkeydown=null;
            label.obblur=null;
            var newname = relativeRename(filename,label.textContent.trim());
            cb(filename,newname);
        }
        
        
        label.onfocus = function() {
            window.setTimeout(function() {
                var sel, range, searchText = label.textContent.split(".")[0];
                    
                if (window.getSelection && document.createRange) {
                    range = document.createRange();
                    range.selectNodeContents(label);
                    sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                } else if (document.body.createTextRange) {
                    range = document.body.createTextRange();
                    range.moveToElementText(label);
                    if (range.findText(searchText, searchText.Length, 0)) {
                        range.select();
                    }
                }
                label.onfocus=null;
                label.onblur=blurred;
            }, 1);
        };
        
        label.onkeydown = function (e) {
             if (!e) {
                e = window.event;
            }
            var keyCode = e.which || e.keyCode,
                target = e.target || e.srcElement;
        
            if (keyCode === 13 && !e.shiftKey) {
                if (e.preventDefault) {
                    e.preventDefault();
                    label.blur();
                } else {
                    e.returnValue = false;
                }
            }
        };
     
        setTimeout(function(){
            label.blur();
            setTimeout(function(){
                label.focus();
            },1);
        },1);
    }
    
    
    function doNewFile(oldname,newname) {
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({new_file:newname}));
        }
    }
    
    
    function newFile(adjacent) {
        adjacent = adjacent||editFile.current||"?.js";
        var ext = adjacent.indexOf(".");
        if (ext<0) {
            ext=".js";
        } else {
            ext=adjacent.substr(ext);
        }
        var i,new_filename,path_parts = adjacent.split("/");
        if(path_parts.length===1) {
            new_filename = "new-file"+ext;
            if (files[new_filename]){
                for(i=1;!!files[new_filename];i++){
                    new_filename = "new-file"+i+ext;
                }
            }
        } else {
            
            path_parts.pop();
            new_filename = path_parts.concat(["new-file"+ext]).join("/");
            if (files[new_filename]){
                for(i=1;!!files[new_filename];i++){
                    new_filename = path_parts.concat(["new-file"+i+ext]).join("/");
                }
            }
        }
        
        file_index = addFile(file_tree,file_index,new_filename,adjacent);
        
        confirmChecked(new_filename); 
        renameFile(new_filename,doNewFile);
        
    } 
    
  
    function copyFile(file) {
        var prefix,ext = file.indexOf(".");
        if (ext<0) {
            ext="";
            prefix=file;
        } else {
            prefix=file.substr(0,ext)+"-copy";
            ext=file.substr(ext);
        }
        var 
        i,
        new_filename = prefix+ext;
        if (files[new_filename]){
            for(i=1;!!files[new_filename];i++){
                new_filename = prefix+i+ext;
            }
        }

        file_index = addFile(file_tree,file_index,new_filename,file);
        confirmChecked(new_filename); 
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({file:file,copied:new_filename}));
        }
        
        
    } 
    
    
    function deleteFile(file) {
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({delete_file:file}));
        }
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
    
    function dirHtml(files, ids, root, ind) {
      root = root || "";
      ind = ind || "";
      var h = "";
      files.forEach(function(f) {
        var i = "f_" + (Object.keys(ids).length + 1).toString(36);
        if (typeof f === "string") {
          var fn = ids[i] = root + f;
          h += ind + '<input type="radio" name="hosted_files" id="'+i+'" value="'+f+'">\n';
          h += ind + '<label data-file="'+fn+'" for="'+i+'">'+f+"</label>\n";
        } else {
            
          var dir = ids[i] = root + f.dir;
          
          h += ind + '<input type="checkbox" id="' + i + '">\n';
          h += ind + '<label data-dir="'+dir+'" for="' + i + '">' + f.dir + "</label>\n";
          h += ind + '<div class="dir_wrapper">\n';
          h += dirHtml(f.files, ids, root + f.dir + "/", ind + " ");
          h += ind + "</div>\n";
        }
      });
      return h;
    }
    
    function loadfiles_setEvents(el, html) {
        el.innerHTML = html;
        el.querySelectorAll("label").forEach(function(lab){
            if (lab.dataset.file) {
                lab.addEventListener("click",fileTreeClick);
            } else {
                
            }
        });
    }
    
    function loadfiles(el, files) {
      var ids = {};
      var list = topFiles(files);
      var html = dirHtml(list, ids);
      loadfiles_setEvents(el, html);
      return ids;
    }
    
    function addFile(el,ids,filename,afterFile) {
        var new_ids={};
        var fls = [],added=false;
        Object.values(ids).forEach(function(f){
            if (files[f]) {
                fls.push(f);
                if (f===afterFile) {
                    fls.push(filename);
                    added=true;
                }
            }
        });
        if (!added) fls.push(filename);
        files[filename]= {
            id    : filename.sha1,
            file  : filename,
            size  : 0,
            mtime : new Date(),
            theme : default_theme,
            mode  : modeFromFilename(filename), 
            windowCount : 0,
            sha1  : "",
            errwarn : "?"
        };
        var list = topFiles(fls);
        var html = dirHtml(list, new_ids);
        loadfiles_setEvents(el, html);
       
        return new_ids;
    }
    
    function removeFile(el,ids,filename)  {
        var new_ids={};
        var fls = [];
        Object.values(ids).forEach(function(f){
            if (files[f]) {
                if (f!==filename) {
                    fls.push(f);
                }
            }
        });
        delete files[filename];
        
        var list = topFiles(fls);
        var html = dirHtml(list, new_ids);
        loadfiles_setEvents(el, html);
       
        return new_ids;
    }
    
    function fileTreeClick(e) {
        editFile (e.target.dataset.file);
    }
    
    function menuShowing() {
        return menu.classList.contains('menu-show');
    }

    function showMenu(x, y){
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.classList.add('menu-show');
    }
    
    function hideMenu(){
        menu.classList.remove('menu-show');
    }
    
    function setupMenu () {
        
        menu = getEl('context_menu');
        
        var 
        
        selectedMenuFile,
        selectedMenuElement,
        menuEvents = {
            
            menu_dir_expand : function(){
                if (selectedMenuElement) {
                    selectedMenuElement.checked=true;
                }
            },
            menu_dir_collapse : function(){
                if (selectedMenuElement) {
                    selectedMenuElement.checked=false;
                }
            },
            menu_file_open : function() {
                 if (selectedMenuFile) {
                       editFile(selectedMenuFile);
                 }
            },
            menu_file_open_new : function(){
                if (selectedMenuFile) {
                    openFile(selectedMenuFile);
                }
            },
            menu_file_open_new_full: function(){
                 if (selectedMenuFile) {
                     openFullscreen(selectedMenuFile);
                 }
            },
            menu_file_rename : function(){
                if (selectedMenuFile) {
                    renameFile(selectedMenuFile,doRenameFile);
                }
            },
            menu_file_debug  : function(){
                if (selectedMenuFile) {
                    debugFile(selectedMenuFile);
                }
            },
            menu_file_serve  : function(){
                if (selectedMenuFile) {
                    serveFile(selectedMenuFile);
                }
            },
            menu_file_copy   : function () {
                if (selectedMenuFile) {
                    copyFile(selectedMenuFile);
                }
            },
            menu_file_delete   : function () {
                 if (selectedMenuFile) {
                    deleteFile(selectedMenuFile);
                }
            },
            menu_file_new : function () {
                if (selectedMenuFile) {
                   newFile(selectedMenuFile);
                }
            },
            menu_editor_enter_full : function(){
                if (selectedMenuFile) {
                     var ed = getEl("editor").dataset.is_full=true;
                     leftPane.style.display="none";
                     paneSep.style.display="none";
                     docEl.requestFullscreen(); 
                 } 
            },
            menu_editor_exit_full : function() {
                document.exitFullscreen();
            }
            
        },
        menuIds=Object.keys(menuEvents);
        menuIds.forEach(function(id){
            getEl(id).addEventListener("mousedown",menuEvents[id],false);
        });
        

        var 
        
        contextMenuSeps = qryAll(".menu-separator"),
        showEl=function(el){el.style.display="block";},
        hideEl=function(el){el.style.display="none";};
        
        function showFileMenu(e,inEditor) {
            var displayFile = selectedMenuFile.split("/").pop();
            menuIds.forEach(function(id) {
                var span  = qrySel("#"+id+" span"),
                template = span.dataset.template;
                if (template) {
                    span.innerHTML = template.split('${file}').join(displayFile);
                }
                
                var disp_mode = "block";
                
                switch (id) {
                    case "menu_editor_enter_full":
                        if (!inEditor || document.fullscreenElement) disp_mode = "none";
                        break;
                    case "menu_editor_exit_full":
                        if (!inEditor || !document.fullscreenElement) disp_mode = "none";
                        break;
                    case "menu_file_open":
                        if (selectedMenuFile===editFile.current ) disp_mode = "none";
                        break;
                    case "menu_file_open_new_full":
                        if (inEditor) disp_mode = "none";
                        break;
                        
                    case "menu_file_new":
                    case "menu_file_rename":
                    case "menu_file_copy":
                    case "menu_file_delete":
                        if (inEditor && document.fullscreenElement) disp_mode = "none";
                        break;
                    default :
                        if ( !id.startsWith("menu_file_")) disp_mode = "none";
                }
                getEl(id).style.display =  disp_mode;
            });
            contextMenuSeps.forEach(showEl);
            
            showMenu(e.pageX, e.pageY);
            menu.addEventListener('blur', closeContextMenu);
            document.addEventListener('mousedown', closeContextMenu, false);
            window.addEventListener('blur', closeContextMenu, false);
        }
        
        function showDirMenu(e) {
            var displayDir = selectedMenuFile.split("/").pop();
            menuIds.forEach(function(id) {
                var span  = qrySel("#"+id+" span"),
                template = span.dataset.template;
                if (template) {
                    span.innerHTML = template.split('${dir}').join(displayDir);
                }
                var el = getEl(id);
                if (!id.startsWith("menu_dir")) {
                    el.style.display = id === "menu_file_new" ? "block" : "none";
                } else {
                    
                    if (getEl(e.target.htmlFor).checked) {
                        el.style.display = id === "menu_dir_expand" ? "none" : "block";
                    } else {
                        el.style.display = id === "menu_dir_collapse" ? "none" : "block";
                    }                
                }
            });
            contextMenuSeps.forEach(showEl);
            hideEl(contextMenuSeps[contextMenuSeps.length-1]);

            showMenu(e.pageX, e.pageY);
            menu.addEventListener('blur', closeContextMenu);
            document.addEventListener('mousedown', closeContextMenu, false);
            window.addEventListener('blur', closeContextMenu, false);
        }
        
        function onContextMenu(e){
               
            e.preventDefault();
            
            if ( e.target && 
                 e.target.htmlFor && 
                 file_index[e.target.htmlFor] && 
                 (selectedMenuElement=getEl(e.target.htmlFor)) &&
                 (selectedMenuFile = file_index[e.target.htmlFor]) 
               ) {
                if (e.target.dataset.file) {
                    showFileMenu(e);
                } else {
                    if (e.target.dataset.dir) {
                        showDirMenu(e);
                    } 
                }
            } else {
                selectedMenuFile=null;
                if (e.target && e.target.classList.contains("file_tree") ){
                   menuIds.forEach(function(id){
                       getEl(id).style.display = id === "menu_file_new" ? "block" : "none";
                   }); 

                   contextMenuSeps.forEach(hideEl);
                   
                   showMenu(e.pageX, e.pageY);
                   menu.addEventListener('blur', closeContextMenu);
                   document.addEventListener('mousedown', closeContextMenu, false);
                   window.addEventListener('blur', closeContextMenu, false);
                } else {
                    if (e.target.className==="ace_text-input"){
                        selectedMenuFile=editFile.current;
                        showFileMenu(e,true);
                    }
                }
            }
            
        }
        
        function closeContextMenu(e){
            hideMenu();
            menu.removeEventListener('blur', closeContextMenu);
            document.removeEventListener('mousedown', closeContextMenu);
            window.removeEventListener('blur', closeContextMenu);
        }
        
        window.top.onContextMenu = onContextMenu;
        
        window.top.closeContextMenu = closeContextMenu;

        document.addEventListener('contextmenu', onContextMenu, false);
        
    }
    
    file_index = loadfiles(file_tree, Object.keys(files));
    
    setupSplitter();
    setupMenu ();

    menu_ws = new WebSocket("ws://" + location.host + ws_prefix+"_index");
    menu_ws.onopen = function() {

       // Web Socket is connected, send data using send()
       // menu_ws.send('{"open":true}');
    };

    menu_ws.onmessage = function (evt) {
       var payload = JSON.parse(evt.data);

       var file,
           fields = [
              "size",
              "mtime",
              "sha1",
              "windowCount",
              "errwarn"
           ],
           update=function(id_prefix,k) {
             if (payload[k]) {
                getEl(id_prefix+k).innerHTML=(file[k]=payload[k]).toString();
             }
           },
           renameId=function(old_prefix,new_prefix,k) {
                getEl(old_prefix+k).id=new_prefix+k;
           };
           
       if (payload.file && (file=files[payload.file]) ) {
           
            if (payload.renamed) {
                if (payload.file!==payload.renamed) {
                    // file has been renamed on file system
                    // update the files directory and the file_index lookup 
                    
                    var 
                    
                    old_prefix = "dir_"+file.id+"_";
                    file.file=payload.renamed;
                    file.id=file.file.sha1;
                    var new_prefix = "dir_"+file.id+"_";
                    
                    files[payload.renamed]=file; // copy file stats to new name in directory
                    delete files[payload.file];  // delete old file stats
                    Object.keys(file_index).some(function(k){
                        if (file_index[k]===payload.file) {
                            file_index[k]=payload.renamed;
                            
                            var radio=getEl(k),
                                label=radio.labels[0];
                            label.dataset.file=payload.renamed;   
                            return true;
                        }
                    });
                    
                    if (editFile.current===payload.file) {
                        editFile.current=payload.renamed;
                    }

                    /*
                    fields.forEach(
                        renameId.bind(
                            this,
                            old_prefix,
                            new_prefix
                        )
                    );*/
                }
                return;
            }
            if (payload.copied) {
                editFile(payload.copied);
                renameFile(payload.copied,doRenameFile);
                return;
            }

            payload.errwarn=(payload.errors||"0")+"/"+(payload.warnings||"0");

            /*fields.forEach(
                    update.bind(
                        this,
                        "dir_"+file.id+"_"
                    )
            );*/

       } else {
           
           if (payload.new_file) {
               editFile(payload.new_file);
           }
           
           if (payload.delete_file) {
               
               if (editFile.current === payload.delete_file) {
                   getEl("editor").innerHTML='';
                   delete editFile.current;
               }
               
               // update the UI and directory objects
               var states = getChecked(file_tree);
               file_index = removeFile(file_tree,file_index,payload.delete_file);
               states.forEach(setChecked);
           }
           
       }
    };

    menu_ws.onclose = function() {
        window.close();
       // if still open, it's not an external window opened via javascript, 
       // so force document.location.reload() which closes the embedded page 
       document.location.reload();

    };
    
    

}

function modeFromFilename(filename) {
    return { ".css" : "css",
             ".html": "html",
             ".json": "json",
             ".sh"  : "sh",
             ".md"  : "markdown",
             ".markdown" : "markdown" }[ filename.substr(filename.lastIndexOf(".")) ] || "javascript";
}

function debugButtonTextFromFilename(filename) {
    return {   ".html"     : "view",
               ".json"     : "",
               ".markdown" : "view",
               ".md"       : "view" }
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
function getEditorMasterHTML (files,title,theme,append_html) {
    
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

        html.append(ace_editor_css_url,"head");
        html.append(title,"title");
        var filesNow = getFiles ();
        
        // append the vars that the page needs using Object.varify()
        // note - the files object is a snapshot at page load.
        // it gets updated in memory as things change. so looking at page source in browser will 
        // show the files as and when the page was first loaded. as edits are made, the 
        // file sizes and sha1 hashses etc get updated in memory.
        html.append({
            default_theme             : theme,
            editor_themes             : editor_themes,
            ws_prefix                 : ws_prefix,
            edited_http_prefix        : edited_http_prefix,
            ace_single_file_edit_url  : ace_single_file_edit_url,
            ace_single_file_debug_url : ace_single_file_debug_url,
            ace_single_file_serve_url : ace_single_file_serve_url,
            files                     : filesNow,
            modeFromFilename          : modeFromFilename
        },"head");


        
        html.append(doc_browser_shorthand);
        html.append(fullscreen_launcher);
        html.append("src-noconflict/ace.js","body");

        
        html.append(masterHTMLBrowserCode,"body");
        
        if (append_html) {
            html.append(append_html,"body");
        }
        res.send(html.html);
    };
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
            swizzleRoute.removeRoute(app,edited_http_prefix+file);
            swizzleRoute.removeRoute(app,ws_prefix+file);
            swizzleRoute.removeRoute(app,ace_single_file_edit_url+file);
            
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

        html.replace('src-noconflict/ace.js',ace_lib_base_url+'/src-min-noconflict/ace.js');

        html.replace(new RegExp("(?<=<pre id=.*>).*(?=<\/pre>)","gs"),'');

        html.append({
            ws_prefix     : ws_prefix,
            edited_http_prefix : edited_http_prefix,
            file          : file,
            file_text     : fileText.value,
            theme         : theme,
            editor_mode   : modeFromFilename(file),
        },"head");

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

function singleFileEditor(theme,file,port,append_html) {

    var app = express();
    var expressWs = require('express-ws')(app);

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
                          
                          if (cmd && typeof cmd.new_file==='string') {
                              
                              fs.writeFile(cmd.new_file,cmd.text||'',function(){
                                 add_editor(cmd.new_file);
                                 ws.send(msg);
                              });
                             
                          }
                          
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
                if (ix >= argv.length ) return files;
                filename = argv[ix];
                if (filename.startsWith('--')) return files;
            }

        }

        ix = argv.indexOf("--dirs");
        if (ix>=2 && ix < argv.length-1 ) {
            ix ++;
            var
            dirname = argv[ix],
            file_path_mapper = function(fn){return path.join(dirname,fn);},
            nm="node_modules",
            not_hidden = function(fn){ return !fn.startsWith(".") && !fn.startsWith(nm+"/") && fn!==nm; };

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
        
        return process.env.ACE_EXPRESS_PORT || 0;// use random port
    }

    var filename = getFilename();
    var files = getFilenames();
    if (filename && files.length===0) {
        var ed = singleFileEditor(getTheme(),filename,getPort() );
        ed.on("open",function(file,ws,updaters){
            console.log("opened:",file,"count:",updaters.length);
        });
        ed.on("close",function(file,updaters){
            
            console.log("closed:",file,"count:",updaters.length);
            
            if (updaters.length===0) {
                process.exit(0);
            }
            
        });
        

    } else {

        if (filename && files.indexOf(filename)<0) {
            files[ process.argv.indexOf("--edit") < process.argv.indexOf("--files")  ? 'unshift' : 'push'](filename);
        }

        if (files.length>0) {
            var eds = multiFileEditor(getTheme(),files,getPort() );
            
            eds.addEventListener("close",function(){
                console.log("close",arguments);
            });
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

module.exports = ace;

if (process.mainModule===module && process.argv.length>2) {
    nodeCLI(process.argv);
}
