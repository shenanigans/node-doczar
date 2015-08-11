
var toc;
var isRevealed = false;
window.onkeydown = function (event) {
    toc = document.getElementById ('TOC');

    window.onkeydown = function (event) {
        if (event.keyCode == 32) {
            if (!isRevealed) {
                toc.className = 'reveal';
                isRevealed = true;
            }
            return false;
        }
        return true;
    };

    window.onkeyup = window.onfocus = function (event) {
        if (event.keyCode == 32 && isRevealed) {
            toc.className = '';
            isRevealed = false;
        }
    };

    if (event.keyCode == 32) {
        toc.className = 'reveal';
        isRevealed = true;
        return false;
    }
    return true;
};
