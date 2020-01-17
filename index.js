
                   var
                   fs=require("fs"),
                   path=require("path"),
                   express=require("express"),
                   ace_js,
                   ace_min_js,
                   ace_file     = require.resolve("ace-builds"),
                   ace_dir      = path.dirname(ace_file),
                   ace_min_dir  = path.join(ace_dir,     "../src-min-noconflict"),
                   ace_min_file = path.join(ace_min_dir, path.basename(ace_file)),
                   ace = {};

                   Object.defineProperties(ace,{
                       min_src : {
                           get : function () {
                               ace_min_js = fs.readFileSync(ace_min_file,"utf8");
                               delete ace.min_src;
                               Object.defineProperties(ace,{
                                   min_src : {
                                       value : ace_min_js
                                   }
                               });
                               return ace_min_js;
                           },
                           configurable:true,enumerable:true
                       },
                       src : {
                           get : function () {
                               ace_js = fs.readFileSync(ace_file,"utf8");
                               delete ace.src;
                               Object.defineProperties(ace,{
                                   src : {
                                       value : ace_js
                                   }
                               });
                               return ace_js;
                           },
                           configurable:true,enumerable:true
                       },
                       express : {
                           value : function (app) {
                               app.use("/ace",express.static(ace_dir));
                               app.use("/ace-min",express.static(ace_min_dir));
                           },
                           configurable:true,enumerable:true
                       }
                   });

		module.exports = ace;
