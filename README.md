# ace-express

literally just a wrapper around **ace-builds** and **express**

why?
---

whilst doing an `npm install ace-builds` gets the files onto your machine, you still need to serve them to the browser somehow.

If your method of choice is **express**, you then need to find the files deep within your **node_modules** folder, figure out which ones to serve and set up routes to that folder.

ace-express does that work for you

    require("ace-express").express(app);

this exposes `/ace` and `/ace-min` to your app, along with a simple `/ace-demo` editor (deployed in the `ace-builds` "editor.html" sample code)



or to spin up the demo editor from the command line:

    node -e 'require("ace-express").demo()'

optionally, set theme and port

    node -e 'require("ace-express").demo("chaos",9000)'

For those curious, here is the entire source of this module, so yes you can just copy/paste/hack (ie not bother installing this wrapper at all), if that's your preference.

**index.js**



    var
    
    fs             = require("fs"),
    path           = require("path"),
    express        = require("express"),
    ace_file       = require.resolve("ace-builds"),
    ace_dir        = path.dirname(ace_file),
    ace_min_dir    = path.join(ace_dir,     "../src-min-noconflict"),
    ace_min_file   = path.join(ace_min_dir, path.basename(ace_file)),
    edit_html_file = path.join(ace_dir, "../editor.html"),
    ace_demos_dir  = path.join(ace_dir, "../demo"),
    edit_html = fs.readFileSync(edit_html_file,"utf8").split("src-noconflict/ace.js").join("ace-min/ace.js"),
    demo_html = edit_html,
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
               app.use("/ace",express.static(ace_dir));
               app.use("/ace-min",express.static(ace_min_dir));
               app.use("/ace-demos",express.static(ace_demos_dir));
               app.get("/ace-demo",function(req,res) {
                    res.send(demo_html);
               });
    
           },
           configurable:true,enumerable:true
       },
       demo : {
        value : function (theme,port) {
            demo_html=theme? edit_html.split('ace/theme/twilight').join('ace/theme/'+theme) : edit_html;
            var app = express();
            ace.express(app);
            // listen for requests :)
            var listener = app.listen(port||3000, function() {
              console.log('goto http://'+hostname+':' + listener.address().port+"/ace-demo");
            });
    
        },
        configurable:true,enumerable:true
    
       }
    });
    
    module.exports = ace;
