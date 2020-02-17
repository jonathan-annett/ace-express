# ace-express

launches browser from the commandline with editor to edit local files on a chromebook

still under development. check back later


installation (only tested on chromebooks!)
------------

    cd ~
    git clone https://github.com/jonathan-annett/ace-express.git
    cd ace-express
    chmod 755 ./install.sh
    ./install.sh
    
simple command line use
-----------------------



    # open a single file
    ace-express --files sample.js
    # open a directory of files
    ace-express --dirs ace-public
    # open a directory of files, and a few extra files
    ace-express --files sample.js install.sh --dirs ace-public
    

when editing, if you search-tab to the terminal window, the following keys can be used:

  * spacebar opens another editor window
  * escape closes all open windows and exits ace-express
  * as well as escape, you can use
    + q 
    + ctrl-q
    + ctrl-c
    + ctrl-d

