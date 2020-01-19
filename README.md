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


