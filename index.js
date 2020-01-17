
var

fs             = require("fs"),
path           = require("path"),
express        = require("express"),
os             = require("os"),
ace_file       = require.resolve("ace-builds"),
ace_dir        = path.dirname(ace_file),
ace_min_dir    = path.join(ace_dir,     "../src-min-noconflict"),
ace_min_file   = path.join(ace_min_dir, path.basename(ace_file)),
edit_html_file = path.join(ace_dir, "../editor.html"),

edit_html = fs.readFileSync(edit_html_file,"utf8").split("src-noconflict/ace.js").join("ace-min/ace.js"),
demo_html = edit_html,
//chromebooks do something funky with localhost under penguin/crostini, so help a coder out....
hostname = (os.hostname()==="penguin" && os.platform()==="linux") ? "penguin.termina.linux.test" : "localhost",

ace = {};

Object.defineProperties(ace,{
   express : {
       value : function (app) {
           app.use("/ace",express.static(ace_dir));
           app.use("/ace-min",express.static(ace_min_dir));
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
