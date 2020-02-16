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
ace = {};



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


function getLinks(file_root,url_root) {
    var links={};
    var re=/\?.*|$/;
    for (var link of document.querySelectorAll("link[rel=stylesheet]")) {
      var url = link.href.replace(re, '');
      links[url]=link;
    }
    
    var update=function(link){if(link)link.href = url.replace(re, '?'+Date.now()); };
    
    return {
        css : function () {
            return links;
        },
        urls : function() {
            return Object.keys(links);
        },
        links : function() {
            return Object.values(links);
        },
        update : function(url) {
            if (url) {
                
                if (file_root) {
                    if (url.startsWith(file_root)) {
                        url=url.substr(file_root);
                        if (url_root) {
                            url=url_root+url;
                        }
                    } else {
                        var fn = url;
                        url=false;
                        Object.keys(links).some(function(u){
                            if (fn.endsWith(u)) {
                                url=u;
                                if (url_root) {
                                    url=url_root+url;
                                }
                                return true;
                            }
                        });
                    }
                }
                if (url) {
                    update(links[url.replace(re, '')]);
                }
            } else {
                Object.values(links).forEach(update);
            }
        }
    };
}


function masterHTMLBrowserCode(
    // the code inside masterHTMLBrowserCode() is injected  into the html page
    // returned by the handler. it's in this scope purely for linting purposes
    // and is converted to a string for injection prior to being returned.
    // effecctively by declaring this function (technically a javascript object) here
    // it acts as a quasi repository

    //these 'vars' are declared elswhere
    files,doc,getEl,docEl,qrySel,qryAll,default_theme,getLinks
) {
  
    var 
    
    menu,
    theme_menu,mode_menu,
    page_css= getLinks("ace-public/","/ace/edit_/"),
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
                 hideThemeMenu();
                 hideModeMenu();
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
    file_index_fn2key=function(filename) {
        var ix = Object.values(file_index).indexOf(filename);
        return ix < 0 ? null : Object.keys(file_index)[ix];
    },
    file_index_key2fn=function(key) {
        return file_index[key]||null;
    },
    file_index_fn2el=function(filename) {
       var key= file_index_fn2key(filename);
       return key ? getEl(key):null;
    },
    file_index_key2el=function(key) {
       return !!file_index[key] ? getEl(key):null;
    },
    leftPane,rightPane,paneSep,activeEditor,editor_resizing,
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
       
       leftPane     = getEl('left-pane');
       rightPane    = getEl('editor');
       editor_resizing = getEl('editor_resizing');
       paneSep      = getEl('panes-separator');
       
       editor_resizing.hidden=true;

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
           
           if (activeEditor && !activeEditor.hidden) {
                activeEditor.hidden=true;
               
           }
        
           editor_resizing.hidden=false;
           editor_resizing.style.left = cur+((100-cur)/2)+"%";
   
       }, 
       
       function () {
          if(activeEditor) activeEditor.hidden=false;
          editor_resizing.hidden = true;
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
    
    function activateEditor(file,attempt,msec) {
        if (files[file].getEditor) {
            files[file].getEditor().focus();
        } else {
            if (!attempt|| attempt < 5) {
                msec=msec||250;
                setTimeout(activateEditor,msec,file,(attempt||0)+1,msec*2);
            }
        }
    }

    function editFile (file) {
        
        file = resolveFile(file);
        if (file && files[file]) {
            if (editFile.current === file) {
                // file is already being edited
                console.log("already open:"+file);
                return;
            }
            
            var existingEditor,obj_id = 'ed_'+file.sha1+'_obj';
            
            if (editFile.current) {
                if ( (existingEditor = getEl('ed_'+editFile.current.sha1+'_obj')) ) {
                    console.log("hiding:"+editFile.current);
                    existingEditor.hidden=true;
                }
            }
            
            editFile.current=file;
            if ( (existingEditor = getEl(obj_id)) ) {
                console.log("showing:"+editFile.current);
                (activeEditor=existingEditor).hidden=false;
                
                activateEditor(confirmChecked(file));

            } else {
                // file not currently loaded
                console.log("loading:"+editFile.current);
                
                var newEditor = document.createElement("OBJECT");
                newEditor.setAttribute("id",obj_id);
                newEditor.setAttribute("type","text/html");
                newEditor.setAttribute("data",ace_single_file_edit_url+encodeURIPath(confirmChecked(file)));
                rightPane.appendChild((activeEditor=newEditor));
                var el = file_index_fn2el(file);
                if (el) {
                    el.classList.add("file_open");
                    el.labels[0].classList.add("file_open");
                }
                
                activateEditor(file);

            }
        }
    }
    
    function closeFile(file) {
        
        file = resolveFile(file);
        if (file && files[file]) {
            
            var editor_id = 'ed_'+file.sha1+'_obj';
            var ed = getEl(editor_id);
            if (ed) rightPane.removeChild(ed);
            
            delete files[file].getEditor;
            var el = file_index_fn2el(file);
            if (el) {
                el.classList.remove("file_open");
                el.labels[0].classList.remove("file_open");
            }
             
            if ((editFile.current === file) || (activeEditor===ed)  ) {
                // file is currently being edited.
                delete editFile.current;
                activeEditor=undefined;
                var last;
                Object.values(files).forEach(function(f){
                    if(f.getEditor) last=f;
                });
                
                if (last) {
                   editFile(last.file);   
                } else {
                    if (el) {
                        el.checked=false;
                    }
                }
            }
            
            
            
        }
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
    
    function setFileEditorTheme(file,theme) {
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({file:file,theme:theme}));
        }
    }
    
    function setDefaultEditorTheme(theme) {
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({default_theme:theme}));
        }
    }
    
    function setFileEditorMode(file,editor_mode) {
        if (menu_ws && typeof menu_ws.send==='function') {
          menu_ws.send(JSON.stringify({file:file,editor_mode:editor_mode}));
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
    
    function dirHtml(f_list, ids, root, ind) {
      root = root || "";
      ind = ind || "";
      var h = "";
      f_list.forEach(function(f) {
        var i = "f_" + (Object.keys(ids).length + 1).toString(36);
        if (typeof f === "string") {
          var fn = ids[i] = root + f;
          var mod = files[fn].mode;
          var thm = files[fn].theme;
          h += ind + '<input type="radio" name="hosted_files" id="'+i+'" value="'+f+'">\n';
          h += ind + '<label data-file="'+fn+'" for="'+i+'">'+f+'&nbsp;<span class="show_theme">'+mod+"/"+thm+'</span></label>\n';
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
      var ids  = {};
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
        editFile (getDatasetField("file",e.target));
    }
    
    function menuShowing() {
        return menu.classList.contains('menu-show');
    }

    function showMenu(x, y){
        menu.style.left = typeof x==='string' ? x : x + 'px';
        menu.style.top  = typeof y==='string' ? y : y + 'px';
        menu.classList.add('menu-show');
    }
    
    function hideMenu(){
        menu.classList.remove('menu-show');
    }
    
    function showThemeMenu(x, y){
        theme_menu.style.left = typeof x==='string' ? x : x + 'px';
        theme_menu.style.top  = typeof y==='string' ? y : y + 'px';
        theme_menu.classList.add('menu-show');
    }
    
    function hideThemeMenu(){
        theme_menu.classList.remove('menu-show');
    }
    
    
    function showModeMenu(x, y){
        mode_menu.style.left = typeof x==='string' ? x : x + 'px';
        mode_menu.style.top  = typeof y==='string' ? y : y + 'px';
        mode_menu.classList.add('menu-show');
    }
    
    function hideModeMenu(){
        mode_menu.classList.remove('menu-show');
    }
    
    
    var setupColorPicker = function (startColor,cb) {
        
        // ex https://codepen.io/hughjorgen/pen/gOppPVv
        
        var ColorPicker;

        (function() {
             
           var imageData;
        
           function insertBefore(element, before) {
             before.parentNode.insertBefore(element, before);
           }
        
           function extend(defaults, options) {
             var extended = {};
             var prop;
             for (prop in defaults) {
               if (Object.prototype.hasOwnProperty.call(defaults, prop)) {
                 extended[prop] = defaults[prop];
               }
             }
             for (prop in options) {
               if (Object.prototype.hasOwnProperty.call(options, prop)) {
                 extended[prop] = options[prop];
               }
             }
             return extended;
           }
        
           function hasClass(element, classname) {
             //var className = " " + classname + " ";
             if ((" " + element.className + " ").replace(/[\n\t]/g, " ").indexOf(" " + classname + " ") > -1) {
               return true;
             }
             return false;
           }
        
           function removeClass(node, className) {
             node.className = node.className.replace(
               new RegExp('(^|\\s+)' + className + '(\\s+|$)', 'g'),
               '$1'
             ).replace(/ +(?= )/g, '').trim();
           }
        
           function addClass(element, className) {
             if (!hasClass(element, className)) {
               element.className += ' ' + className;
               element.className = element.className.replace(/ +(?= )/g, '').trim()
             }
           }
        
           ColorPicker = function(element, options) {
        
             this.options = extend({
               color: '#e7e7e7',
               palettes: ['#f7931e', '#f9d023', '#8cc63f', '#00a99d','#0071bc','#a966ff','#93278f','#ed1e79','#ea1f41','#ff5310','#ffaa7c','#ffaa7c','#ffaa7c','#ffaa7c','#ffaa7c','#ffaa7c','#ffaa7c'],
               onUpdate: function() {}
             }, options);
        
             this.options.palettes.unshift(this.options.color);
        
             this.hex = this.options.color;
             this.rgb = this.HEXtoRGB(this.hex);
             this.hsv = this.RGBtoHSV(this.rgb[0], this.rgb[1], this.rgb[2]);
             this.dom = {};
             this.dom.container = document.createElement('div');
             this.dom.container.className = 'color-picker-container';
        
             element.appendChild(this.dom.container);
        
             this.initPicker();
        
             this.initPalettes();
           }
        
           ColorPicker.prototype.initPicker = function() {
        
             this.dom.picker = {};
             this.dom.picker.container = document.createElement('div');
             this.dom.picker.container.className = 'picker-container';
        
             this.dom.container.appendChild(this.dom.picker.container);
        
             this.dom.picker.canvas = {};
        
             this.dom.picker.canvas.container = document.createElement('div');
             this.dom.picker.canvas.container.className = 'canvas-container';
             this.dom.picker.container.appendChild(this.dom.picker.canvas.container);
        
             this.dom.picker.canvas.canvas = document.createElement('canvas');
             this.dom.picker.canvas.canvas.className = 'canvas';
        
             this.dom.picker.canvas.pointer = document.createElement('div');
             this.dom.picker.canvas.pointer.className = 'pointer';
        
             var ctx = this.dom.picker.canvas.canvas.getContext('2d'),
               image = new Image(),
               $this = this,
               dragging = false;
        
             this.dom.picker.canvas.canvas.setAttribute('width', 200);
             this.dom.picker.canvas.canvas.setAttribute('height', 200);
             this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.canvas);
             this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.pointer);
        
             // image.src = 'images/wheel copy.png';
             image.src = 'data:image/png;base64,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';
        
             image.onload = function() {
               $this.updateCanvasBounds();
               ctx.drawImage(image, 0, 0, 200, 200);
               $this.updateCoordinates($this.dom.picker.canvas.canvas.bounds.centerX, $this.dom.picker.canvas.canvas.bounds.centerY);
               var coordinates = $this.getPositionFromColor($this.hex);
               if (coordinates !== null) {
                 $this.x = coordinates.x;
                 $this.y = coordinates.y;
                 $this.updateColor($this.HEXtoRGB($this.hex));
                 $this.updateAll();
               }
               $this.options.onUpdate($this.rgb);
             };
        
             this.dom.picker.canvas.canvas.addEventListener('mousedown', function(e) { 
               e.preventDefault();
               dragging = true;
               $this.updateCoordinates(e.clientX, e.clientY);
               imageData = ctx.getImageData($this.x, $this.y, 1, 1);
               $this.updateColor(imageData.data);
               $this.hsv[2] = 1;
               $this.updateAll();
             });
        
             document.addEventListener('mousemove', function(e) { // mouse move handler
               if (dragging) {
                 $this.updateCoordinates(e.pageX, e.pageY);
                 imageData = ctx.getImageData($this.x, $this.y, 1, 1);
                 $this.updateColor(imageData.data);
                 $this.hsv[2] = 1;
                 $this.updateAll();
               }
             });
        
             document.addEventListener('mouseup', function(e) { // click event handler
               dragging = false;
             });
        
             this.dom.picker.canvas.input = document.createElement('input'),
        
               this.dom.picker.canvas.container.appendChild(this.dom.picker.canvas.input);
            
             var input_key_up = function() {
                                  console.log("###",this.value)
                                  if(this.value == $this.hex || '#' + this.value == $this.hex){
                                    return;
                                  }
                                  var coordinates = $this.getPositionFromColor(this.value);
                                  if (coordinates !== null) {
                                    $this.x = coordinates.x;
                                    $this.y = coordinates.y;
                                    $this.updateColor($this.HEXtoRGB(this.value));
                                    $this.updateAll();
                                  }
                                };
                                
             this.dom.picker.canvas.input.addEventListener('keyup', input_key_up);
             
             
             this.setHexValue=function(hex) {
                 this.dom.picker.canvas.input.value=hex;
                 input_key_up.call(this.dom.picker.canvas.input);
             }
        
             this.initSlider();
        
           }
        
           ColorPicker.prototype.initSlider = function() {
        
             this.dom.slider = {};
             this.dom.slider.container = document.createElement('div');
             this.dom.slider.container.className = 'slider-container';
        
             this.dom.slider.slider = document.createElement('div');
             this.dom.slider.slider.className = 'slider';
        
             this.dom.slider.pointer = document.createElement('div');
             this.dom.slider.pointer.className = 'pointer';
        
             this.dom.slider.container.appendChild(this.dom.slider.pointer);
             this.dom.slider.container.appendChild(this.dom.slider.slider);
             this.dom.picker.container.appendChild(this.dom.slider.container);
        
             this.dom.slider.slider.bounds = this.dom.slider.slider.getBoundingClientRect();
             this.dom.slider.pointer.bounds = this.dom.slider.pointer.getBoundingClientRect();
        
             this.redrawSlider();
        
             var dragging = false,
               $this = this;
        
             this.dom.slider.slider.addEventListener('mousedown', function(e) {
               e.preventDefault();
               dragging = true;
               var total = $this.updateSliderCursor(e.clientY);
               $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
               $this.updateAll();
             });
        
             this.dom.slider.pointer.addEventListener('mousedown', function(e) {
               e.preventDefault();
               dragging = true;
               var total = $this.updateSliderCursor(e.clientY);
               $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
               $this.updateAll();
             });
        
             document.addEventListener('mousemove', function(e) {
               if (!dragging) {
                 return;
               }
               var total = $this.updateSliderCursor(e.clientY);
               $this.updateColor($this.HSVtoRGB($this.hsv[0], $this.hsv[1], 1 - total));
               $this.updateAll();
             });
        
             document.addEventListener('mouseup', function() {
               dragging = false;
             });
           };
        
           ColorPicker.prototype.updateColor = function(pixel) {
             var hex;
             this.hex = hex = this.RGBtoHEX(pixel[0], pixel[1], pixel[2]);
             this.hsv = this.RGBtoHSV(pixel[0], pixel[1], pixel[2]);
             this.rgb = [
               pixel[0],
               pixel[1],
               pixel[2]
             ];
           }
        
           ColorPicker.prototype.updateCoordinates = function(x, y) {
             var angle = Math.atan2((y - this.dom.picker.canvas.canvas.bounds.centerY), (x - this.dom.picker.canvas.canvas.bounds.centerX));
             var radius = Math.sqrt(Math.pow(x - this.dom.picker.canvas.canvas.bounds.centerX, 2) + Math.pow(y - this.dom.picker.canvas.canvas.bounds.centerY, 2));
             if (radius > this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) {
               var cos = Math.cos(angle);
               var sin = Math.sin(angle);
               x = cos * (this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) + this.dom.picker.canvas.canvas.bounds.centerX;
               y = sin * (this.dom.picker.canvas.canvas.bounds.radius - (this.dom.picker.canvas.pointer.bounds.width / 2)) + this.dom.picker.canvas.canvas.bounds.centerY;
             }
             this.x = Math.floor(x - this.dom.picker.canvas.canvas.bounds.left);
             this.y = Math.floor(y - this.dom.picker.canvas.canvas.bounds.top);
           }
        
           ColorPicker.prototype.initPalettes = function() {
             this.dom.palettes = {};
             this.dom.palettes.list = [];
             this.dom.palettes.container = document.createElement('div');
             addClass(this.dom.palettes.container, 'palletes-container');
             this.dom.container.appendChild(this.dom.palettes.container);
             this.dom.palettes.add = document.createElement('div');
             // addClass(this.dom.palettes.add, 'palette add');
             this.dom.palettes.container.appendChild(this.dom.palettes.add);
             var $this = this;
             this.dom.palettes.add.addEventListener('click', function() {
               addClass($this.dom.picker.canvas.container, 'active');
               $this.updateCanvasBounds();
               palette = $this.addPalette($this.RGBtoHEX($this.rgb[0], $this.rgb[1], $this.rgb[2]));
               for (var i = 0; i < $this.dom.palettes.list.length; i++) {
                 removeClass($this.dom.palettes.list[i], 'active');
               }
               addClass(palette, 'active');
               $this.selectedPalette = palette;
             });
             for (var i = 0; i < this.options.palettes.length; i++) {
               this.addPalette(this.options.palettes[i]);
             }
           }
        
           ColorPicker.prototype.addPalette = function(color) {
             var palette = document.createElement('div');
             palette.style.background = color;
             palette.color = color;
             var $this = this;
             palette.addEventListener('click', function() {
               for (var i = 0; i < $this.dom.palettes.list.length; i++) {
                 removeClass($this.dom.palettes.list[i], 'active');
               }
               addClass(this, 'active');
               $this.selectedPalette = this;
               rgb = $this.HEXtoRGB(this.color);
               coordinates = $this.getPositionFromColor(color);
               $this.x = coordinates.x;
               $this.y = coordinates.y;
               $this.updateColor(rgb);
               $this.updateAll();
             });
             addClass(palette, 'palette');
             insertBefore(palette, this.dom.palettes.add);
             this.dom.palettes.list.push(palette);
             return palette;
           }
        
           ColorPicker.prototype.updateAll = function() {
             this.redrawSlider();
             this.updatePointers();
             this.dom.picker.canvas.input.value = this.hex;
             this.options.onUpdate(this.rgb);
             if (this.selectedPalette) {
               this.selectedPalette.style.background = this.hex;
             }
           }
           ColorPicker.prototype.getPositionFromColor = function(color) {
             color = this.HEXtoRGB(color);
             if (color == null) {
               return null;
             }
             this.hsv = this.RGBtoHSV(color[0], color[1], color[2]);
             return this.getSVGPositionFromHS(this.hsv[0], this.hsv[1]);
           }
        
           ColorPicker.prototype.updateSliderCursor = function(y) {
             total = y - this.dom.slider.slider.bounds.top - 6;
             total = this.dom.slider.slider.bounds.height - total;
             total = total / this.dom.slider.slider.bounds.height;
             total = total.toFixed(2);
             if (total < 0) {
               total = 0;
             } else if (total > 1) {
               total = 1;
             }
             total = 1 - total;
             this.dom.slider.pointer.style.top = this.dom.slider.slider.bounds.height * total - (this.dom.slider.pointer.bounds.height / 2) + 'px';
             return total;
           }
        
           ColorPicker.prototype.redrawSlider = function() {
             rgb = this.HSVtoRGB(this.hsv[0], this.hsv[1], 1);
             hex = this.RGBtoHEX(rgb[0], rgb[1], rgb[2]);
             gradient = this.makeGradient(hex, '#000');
             this.dom.slider.slider.setAttribute('style', gradient);
             this.updatePointers();
           };
        
           ColorPicker.prototype.updatePointers = function() {
             if (this.dom.picker.canvas.pointer.bounds) {
               this.dom.picker.canvas.pointer.style.left = this.x - (this.dom.picker.canvas.pointer.bounds.width / 2) + 'px';
               this.dom.picker.canvas.pointer.style.top = this.y - (this.dom.picker.canvas.pointer.bounds.height / 2) + 'px';
             }
             if (this.dom.slider.slider.bounds) {
               position = this.dom.slider.slider.bounds.height * (1 - this.hsv[2]) - (this.dom.slider.pointer.bounds.height / 2);
               this.dom.slider.pointer.style.top = position + 'px';
             }
           }
        
           ColorPicker.prototype.updateCanvasBounds = function() {
               this.dom.picker.canvas.canvas.bounds = this.dom.picker.canvas.canvas.getBoundingClientRect();
               this.dom.picker.canvas.pointer.bounds = this.dom.picker.canvas.pointer.getBoundingClientRect();
               this.dom.picker.canvas.canvas.bounds.centerX = this.dom.picker.canvas.canvas.bounds.left + (this.dom.picker.canvas.canvas.bounds.width / 2);
               this.dom.picker.canvas.canvas.bounds.centerY = this.dom.picker.canvas.canvas.bounds.top + (this.dom.picker.canvas.canvas.bounds.height / 2);
               this.dom.picker.canvas.canvas.bounds.radius = this.dom.picker.canvas.canvas.bounds.width / 2;
             }
             // https://codepen.io/benknight/pen/nADpy
             // Get a coordinate pair from hue and saturation components.
           ColorPicker.prototype.getSVGPositionFromHS = function(h, s) {
             var hue = this.scientificToArtisticSmooth(h * 360);
             var theta = hue * (Math.PI / 180);
             var y = Math.sin(theta) * this.dom.picker.canvas.canvas.bounds.radius * s;
             var x = Math.cos(theta) * this.dom.picker.canvas.canvas.bounds.radius * s;
             return {
               x: x + this.dom.picker.canvas.canvas.bounds.radius,
               y: this.dom.picker.canvas.canvas.bounds.radius - y
             }
        
           };
        
           //https://codepen.io/benknight/pen/nADpy
           ColorPicker.prototype.scientificToArtisticSmooth = function(hue) {
             return (
               hue < 35 ? hue * (60 / 35) :
               hue < 60 ? this.mapRange(hue, 35, 60, 60, 122) :
               hue < 120 ? this.mapRange(hue, 60, 120, 122, 165) :
               hue < 180 ? this.mapRange(hue, 120, 180, 165, 218) :
               hue < 240 ? this.mapRange(hue, 180, 240, 218, 275) :
               hue < 300 ? this.mapRange(hue, 240, 300, 275, 330) :
               this.mapRange(hue, 300, 360, 330, 360));
           }
        
           //https://codepen.io/benknight/pen/nADpy
           ColorPicker.prototype.mapRange = function(value, fromLower, fromUpper, toLower, toUpper) {
             return (toLower + (value - fromLower) * ((toUpper - toLower) / (fromUpper - fromLower)));
           }
        
           //https://gist.github.com/Arahnoid/9923989
           ColorPicker.prototype.HEXtoRGB = function(hex) {
             var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
             return result ? [
               parseInt(result[1], 16),
               parseInt(result[2], 16),
               parseInt(result[3], 16)
             ] : null;
           }
        
           //http://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
           ColorPicker.prototype.RGBtoHSV = function(r, g, b) {
             r = r / 255, g = g / 255, b = b / 255;
             var max = Math.max(r, g, b),
               min = Math.min(r, g, b);
             var h, s, v = max;
        
             var d = max - min;
             s = max == 0 ? 0 : d / max;
        
             if (max == min) {
               h = 0; // achromatic
             } else {
               switch (max) {
                 case r:
                   h = (g - b) / d + (g < b ? 6 : 0);
                   break;
                 case g:
                   h = (b - r) / d + 2;
                   break;
                 case b:
                   h = (r - g) / d + 4;
                   break;
               }
               h /= 6;
             }
             return [h, s, v];
           }
        
           //http://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
           ColorPicker.prototype.HSVtoRGB = function(h, s, v) {
             var r, g, b;
             var i = Math.floor(h * 6);
             var f = h * 6 - i;
             var p = v * (1 - s);
             var q = v * (1 - f * s);
             var t = v * (1 - (1 - f) * s);
             switch (i % 6) {
               case 0:
                 r = v, g = t, b = p;
                 break;
               case 1:
                 r = q, g = v, b = p;
                 break;
               case 2:
                 r = p, g = v, b = t;
                 break;
               case 3:
                 r = p, g = q, b = v;
                 break;
               case 4:
                 r = t, g = p, b = v;
                 break;
               case 5:
                 r = v, g = p, b = q;
                 break;
             }
             return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
           }
        
           //https://gist.github.com/Arahnoid/9923989
           ColorPicker.prototype.RGBtoHEX = function(r, g, b) {
             function componentToHex(c) {
               var hex = c.toString(16);
               return hex.length == 1 ? "0" + hex : hex;
             }
             return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
           }
        
           //http://jsfiddle.net/barney/D9W4v/
           ColorPicker.prototype.makeGradient = function(colour1, colour2) {
             var gradientString = '\
                    /* Mozilla Firefox */ \
                    background-image: -moz-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
                    /* Opera */ \
                    background-image: -o-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
                    /* Webkit (Safari/Chrome 10) */ \
                    background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, {colour1}), color-stop(1, {colour2}));\
                    /* Webkit (Chrome 11+) */ \
                    background-image: -webkit-linear-gradient(top, {colour1} 0%, {colour2} 100%);\
                    /* IE10+ */\
                    background: -ms-linear-gradient(top,  {colour1} 0%,{colour2} 100%);\
                    /* W3C */\
                    background: linear-gradient(top,  {colour1} 0%,{colour2} 100%);\
                ';
        
             return gradientString.replace(/\{colour1\}/g, colour1).replace(/\{colour2\}/g, colour2)
           };
         }());
        
        var pickerElement = document.getElementById('picker');
         
        var picker,last,CB;
         
        function openPicker(startColor,cb) {
             CB=cb;
             last=startColor;
             picker = new ColorPicker(pickerElement, {
               onUpdate: function(rgb) {
                   CB((last=rgb),false);
               }
             });
             if (startColor) {
                 setTimeout(function(){picker.setHexValue(startColor);},10);
             }
             pickerElement.addEventListener('blur',closePicker);
        }         
         
        function closePicker() {
            picker = null;
            pickerElement.innerHTML = '';
            pickerElement.removeEventListener('blur',closePicker);
            CB(last,true);
        }
        
        setupColorPicker = function (startColor,cb) {
            picker = null;
            openPicker(startColor,cb) ;
            return closePicker;
        }
        
        openPicker(startColor,cb) ;
        
        return closePicker;
        
    };
    
    
    
    var colourNameToHex = function (colour,reverse) {
        var colours = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
        "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887",
        "cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff",
        "darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f",
        "darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkturquoise":"#00ced1",
        "darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dodgerblue":"#1e90ff",
        "firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff",
        "gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f",
        "honeydew":"#f0fff0","hotpink":"#ff69b4",
        "indianred ":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c",
        "lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2",
        "lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightsteelblue":"#b0c4de",
        "lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6",
        "magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
        "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5",
        "navajowhite":"#ffdead","navy":"#000080",
        "oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
        "palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080",
        "rebeccapurple":"#663399","red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1",
        "saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4",
        "tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0",
        "violet":"#ee82ee",
        "wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5",
        "yellow":"#ffff00","yellowgreen":"#9acd32"},
        colourNames = Object.keys(colours),
        colorValues = Object.values(colours);
        
        var result = function (colour,reverse) {
            if (reverse) {
                var index = colorValues.indexOf(colour);
                return (index<0) ? colour : colourNames[index];
            }
            return colours[colour.toLowerCase()]||false;
        };
        colourNameToHex = result;
        
        return result(colour,reverse);
    }
    
    function colorToHex(color) {
        if (color==="#000000") {
            return color;
        } else {
            
            if ((color.length===7) && color.startsWith("#")) {
                if (parseInt(color.substr(1),16)>0) {
                   return color;        
                }
            } else {
                return colourNameToHex(color);
            }
        } 
        
        return false;
    }
    
    function hexToColor (hex) {
        return colourNameToHex(hex,true);
    }
    
    function setupMenu () {
        
        menu = getEl('context_menu');
        
        (theme_menu = getEl('theme_menu')).innerHTML = editorThemesHtml();
        (mode_menu = getEl('mode_menu')).innerHTML = editorModesHtml();
        
        setEditorThemeClick(function(theme){
            default_theme = theme;
        });
        
        
        setEditorModeClick(function(mode){
            
        });
        
        
        var currentSelectedColor = function() {
            
            var editor = window.top.getCurrentEditor();
            
            if (editor && !editor.selection.$isEmpty) {
                
               return colorToHex(editor.getSession().doc.getTextRange(editor.selection.getRange()));
               
            }
            
            return false;
        }
        
        var 
        
        selectedMenuFile,
        selectedMenuElement,
        
        menuEvents = {
            
            menu_dir_expand         : {
                click:function(e){
                    if (selectedMenuElement) {
                        selectedMenuElement.checked=true;
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuContext==="dir";
                },
            },
            menu_dir_collapse       : {
                click:function(e){
                    if (selectedMenuElement) {
                        selectedMenuElement.checked=false;
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuContext==="dir";
                },
            },
            menu_file_open          : {
                click:function(e){
                     if (selectedMenuFile) {
                           editFile(selectedMenuFile);
                     }
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "editor":
                        case "theme":
                            return false;
                        case "file":
                            return (selectedMenuFile!==editFile.current);
                        default:
                            return false;
                    }
                },
            },
            menu_file_close         : {
                click:function(e){
                    if (selectedMenuFile) {
                         closeFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    switch (menuContext) {
                        case "dir":
                            return false;
                        case "editor":
                        case "theme": 
                        case "file":
                            return files[selectedMenuFile] && !!files[selectedMenuFile].getEditor;
                        default:
                            return false;
                    }
                },
            }, 
            menu_file_open_new      : {
                click:function(e){
                    if (selectedMenuFile) {
                        openFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "editor":
                        case "theme":
                            return false;
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                },
            },
            menu_file_open_new_full : {
                click:function(e){
                     if (selectedMenuFile) {
                         openFullscreen(selectedMenuFile);
                     }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuEvents.menu_file_open_new.showing(e,menuContext,menuEl);
                },
            },
            menu_file_rename        : {
                click:function(e){
                    if (selectedMenuFile) {
                        renameFile(selectedMenuFile,doRenameFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "theme":
                            return false;
                        case "editor":
                            return !document.fullscreenElement;
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                },
            },
            menu_file_debug         : {
                click:function(e){
                    if (selectedMenuFile) {
                        debugFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "theme":
                            return false;
                        case "editor":
                            return !document.fullscreenElement;
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                },
            },
            menu_file_serve         : {
                click:function(e){
                    if (selectedMenuFile) {
                        serveFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuEvents.menu_file_debug.showing(e,menuContext,menuEl);
                },
            },
            menu_file_copy          : {
                click:function(e){
                    if (selectedMenuFile) {
                        copyFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuEvents.menu_file_rename.showing(e,menuContext,menuEl);
                },
            },
            menu_file_delete        : {
                click:function(e){
                     if (selectedMenuFile) {
                        deleteFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "theme":
                            return false;
                        case "editor":
                            return !document.fullscreenElement;
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                },
            },
            menu_file_new           : {
                click:function(e){
                    if (selectedMenuFile) {
                       newFile(selectedMenuFile);
                    }
                },
                showing: function(e,menuContext,menuEl) {
                    return menuEvents.menu_file_rename.showing(e,menuContext,menuEl);
                },
            },
            menu_editor_enter_full  : {
                click:function(e){
                    if (selectedMenuFile) {
                         var ed = getEl("editor").dataset.is_full=true;
                         leftPane.style.display="none";
                         paneSep.style.display="none";
                         docEl.requestFullscreen(); 
                     } 
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "file":
                        case "theme":
                            return false;
                        case "editor":
                            return !document.fullscreenElement;
                        default:
                            return false;
                    }
                },
            },
            menu_editor_exit_full   : {
                click:function(e){
                    document.exitFullscreen();
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "file":
                        case "theme":
                            return false;
                        case "editor":
                            return !!document.fullscreenElement;
                        default:
                            return false;
                    }
                },
            },
            menu_editor_picker      : {
                click:function(e){
    
                    var startColor = currentSelectedColor();
                    
                    if (startColor) {
                        
                       var 
                       
                       formatter = function (rgb) {
                          return '#'+rgb.map(function(x){
                                     return  ("00"+x.toString(16)).substr(-2);
                                 }).join(""); 
                       },
                       
                       editor = window.top.getCurrentEditor(),
                       closer =  setupColorPicker (startColor,function(rgb,done){
                           if (!done) return;
                           
                           var editor = window.top.getCurrentEditor();
                           if (editor) {
                               
                               var  
                               text = hexToColor(formatter(rgb)),
                               range = editor.selection.getRange(); 
                               
                               editor.session.replace(range, text);
    
                               range.end.column = range.start.column+text.length;
                               editor.selection.setRange(range);
                           }
                           
                       });
                       
                       var edMouseDown = function() {
                           closer();
                           editor.removeEventListener("mousedown",edMouseDown);
                       }
                       
                       editor.addEventListener("mousedown",edMouseDown);
                       
                    }
                    
                     
                },
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "dir":
                        case "file":
                        case "theme":
                            return false;
                        case "editor":
                            return !!currentSelectedColor();
                        default:
                            return false;
                    }
                },
            },
            menu_file_theme         : {
                click:function(e){
    
                    document.removeEventListener('mousedown', closeContextMenu);
                    
                    setEditorThemeClick(
    
                        getEl("menu_file_theme").menuContext==="editor"  ? function(theme){ 
                        
                            setFileEditorTheme(editFile.current,theme);
                            
                        }
                        : function(theme){ 
                                      
                            setFileEditorTheme(selectedMenuFile,theme);
                            editFile(selectedMenuFile);
                                      
                        }
                        
                    );
    
    
                    showThemeMenu(e.pageX, "5vh");
                    
                    setTimeout(function() {
                        document.addEventListener('mousedown', closeContextMenu);
                    },1);
                },
                showing: function(e,menuContext,menuEl) {
                    switch (menuContext) {
                       case  "editor" :
                          menuEl.querySelector("span.menu-text").innerHTML = "Change Theme";
                          return true;
                       case "theme": 
                          return true;
                       default:
                         return false;
                    }
                },
            },
            menu_file_mode          : {
                click:function(e){
                    document.removeEventListener('mousedown', closeContextMenu);
                    
                    setEditorModeClick(
    
                        getEl("menu_file_mode").menuContext==="editor"  ? function(mode){ 
                        
                                setFileEditorMode(editFile.current,mode);
                            
                        }
                        : function(mode){ 
                                      
                            setFileEditorMode(selectedMenuFile,mode);
                            editFile(selectedMenuFile);
    
                        }
                        
                    );
    
    
                    showModeMenu(e.pageX, "5vh");
                    
                    setTimeout(function() {
                        document.addEventListener('mousedown', closeContextMenu);
                    },1);
                },
                showing: function(e,menuContext,menuEl) {
                    switch (menuContext) {
                       case  "editor" :
                          menuEl.querySelector("span.menu-text").innerHTML = "Change Editor Mode";
                          return true;
                          break;
                       case "theme": 
                          return true;
                       default:
                         return false;
                    }
                },
            },
            
            menu_sep1 : {
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "theme":
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                }
            },
            menu_sep2 : {
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "theme":
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                }
            },
            menu_sep3 : {
                showing: function(e,menuContext,menuEl) {
                    switch(menuContext) {
                        case "theme":
                        case "file":
                            return true;
                        default:
                            return false;
                    }
                }
            }
        },
        
        menuIds=Object.keys(menuEvents);
        menuIds.forEach(function(id){
            getEl(id).addEventListener("mousedown",menuEvents[id].click,false);
        });
        

        var 
        
        contextMenuSeps = qryAll(".menu-separator"),
        showEl=function(el){el.style.display="block";},
        hideEl=function(el){el.style.display="none";};
        
        function showFileMenu(e,menuContext) {
            var displayFile = selectedMenuFile.split("/").pop();
            menuIds.forEach(function(id) {
                var span  = qrySel("#"+id+" span"),
                template = span ? span.dataset.template : false;
                if (template) {
                    span.innerHTML = template.split('${file}').join(displayFile);
                }
                
                var menuEl = getEl(id);
                menuEl.dataset.menuContext=menuContext;
                menuEl.style.display =  menuEvents[id].showing(e,menuContext,menuEl) ? "block" : "none";
                
            });
            contextMenuSeps.forEach(menuContext==="theme"?hideEl:showEl);
            hideThemeMenu();
            hideModeMenu();
            showMenu(e.pageX, e.pageY);
            menu.addEventListener('blur', closeContextMenu);
            document.addEventListener('mousedown', closeContextMenu, false);
            window.addEventListener('blur', closeContextMenu, false);
        }
        /*
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

            hideThemeMenu();
            hideModeMenu();
            showMenu(e.pageX, e.pageY);
            menu.addEventListener('blur', closeContextMenu);
            document.addEventListener('mousedown', closeContextMenu, false);
            window.addEventListener('blur', closeContextMenu, false);
        }
        */
        function onContextMenu(e){
               
            e.preventDefault();
            
            if ( e.target && 
                 e.target.htmlFor && 
                 file_index[e.target.htmlFor] && 
                 (selectedMenuElement=getEl(e.target.htmlFor)) &&
                 (selectedMenuFile = file_index[e.target.htmlFor]) 
               ) {
                if (getDatasetField("file",e.target)) {
                    showFileMenu(e,"file");
                } else {
                    if (getDatasetField("dir",e.target)) {
                        showFileMenu(e,"dir");
                    } 
                }
            } else {
                selectedMenuFile=null;
                if (e.target && e.target.classList.contains("file_tree") ){
                   menuIds.forEach(function(id){
                       getEl(id).style.display = id === "menu_file_new" ? "block" : "none";
                   }); 

                   contextMenuSeps.forEach(hideEl);
                   hideThemeMenu();
                   hideModeMenu();
                   showMenu(e.pageX, e.pageY);
                   menu.addEventListener('blur', closeContextMenu);
                   document.addEventListener('mousedown', closeContextMenu, false);
                   window.addEventListener('blur', closeContextMenu, false);
                } else {
                    if (e.target.className==="ace_text-input"){
                        selectedMenuFile=editFile.current;
                        showFileMenu(e,"editor");
                    } else {
                        if (e.target.className==="show_theme"){
                            selectedMenuFile = file_index[e.target.parentElement.htmlFor];
                            showFileMenu(e,"theme");
                        }
                    }
                }
            }
            
        }
        
        function closeContextMenu(e){
            hideMenu();
            hideThemeMenu();
            hideModeMenu();
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
            var el;
            if (payload.theme) {
                
                el = file_index_fn2el(payload.file);
                if (el) {
                    file.theme=payload.theme;
                    el.labels[0].querySelector(".show_theme").innerHTML = file.mode+"/"+file.theme;
                }
            }
            
            
            if (payload.editor_mode) {
                
                el = file_index_fn2el(payload.file);
                if (el) {
                    file.mode=payload.editor_mode;
                    el.labels[0].querySelector(".show_theme").innerHTML = file.mode+"/"+file.theme;
                }
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
           
           
           if (payload.default_theme) {
               
               default_theme= payload.default_theme;
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
function getEditorMasterHTML (files,title,theme,faExpress,append_html) {
    
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

        html.append(faExpress.url_min,"head");
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
            editor_modes              : editor_modes,
            getDatasetField           : getDatasetField,
            editorListHtml            : editorListHtml,
            editorThemesHtml          : editorThemesHtml,
            setEditorThemeClick       : setEditorThemeClick,
            editorModesHtml           : editorModesHtml,
            setEditorModeClick        : setEditorModeClick,
            ws_prefix                 : ws_prefix,
            edited_http_prefix        : edited_http_prefix,
            ace_single_file_edit_url  : ace_single_file_edit_url,
            ace_single_file_debug_url : ace_single_file_debug_url,
            ace_single_file_serve_url : ace_single_file_serve_url,
            getLinks                  : getLinks,
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
            var json = JSON.stringify ({file:file, editor_mode:editor_mode});
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
        theme    : { get : function (){return theme;}, set : set_theme },
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
    var faExpress = require ('font-awesome-express')(app);

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
