
module.exports = function(getEl,leftPane,rightPane,editor_resizing,paneSep,activeEditor) {


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


};