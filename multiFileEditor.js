module.exports = function (

    ace_dir,
    ace_editor_dir,
    ace_lib_base_url,
    ace_editor_base_url,
    ace_multi_file_dashboard_url,
    editor_CLI_KeyLoop,
    ws_prefix,
    getEditorMasterHTML,
    fileEditor
  
) {
    
    var 
    hostname = require("get-localhost-hostname"),
    express = require("express"),
    favicon                 = require('serve-favicon'),
    remote_ip      = require('@zhike/remote-ip-express-middleware');
    
    
    return function multiFileEditor(theme,files,port,append_html) {
           
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
           };
    
    
}