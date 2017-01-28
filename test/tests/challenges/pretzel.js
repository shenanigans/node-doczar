
/*  @module
    Recursive pretzel of several functions. Without prevention of repetitive call expression
    processing, the WAITING_CALLS list becomes excessively long, attempting to process the final
    recursive function 87,380 times. This will cause a test failure by timeout on any believable
    system in the next few years.
*/

module.exports.empty = function(){
    function first(){
        second();
        second();
        second();
        second();
    }

    function second(){
        third();
        third();
        third();
        third();
    }

    function third(){
        fourth();
        fourth();
        fourth();
        fourth();
    }

    function fourth(){
        fifth();
        fifth();
        fifth();
        fifth();
    }

    function fifth(){
        sixth();
        sixth();
        sixth();
        sixth();
    }

    function sixth(){
        seventh();
        seventh();
        seventh();
        seventh();
    }

    function seventh(){
        eighth();
        eighth();
        eighth();
        eighth();
    }

    function eighth(){
        ninth();
        ninth();
        ninth();
        ninth();
    }

    function ninth(){
        first();
    }
};

module.exports.tricky = function (able, baker) {
    function first(){
        second (8999);
        second (9001);
        second ('nine thousand', 9000);
        second ();
    }

    function second(){
        third (8999);
        third (9001);
        third ('nine thousand', 9000);
        third ();
    }

    function third(){
        fourth (8999);
        fourth (9001);
        fourth ('nine thousand', 9000);
        fourth ();
    }

    function fourth(){
        fifth (8999);
        fifth (9001);
        fifth ('nine thousand', 9000);
        fifth ();
    }

    function fifth(){
        sixth (8999);
        sixth (9001);
        sixth ('nine thousand', 9000);
        sixth ();
    }

    function sixth(){
        seventh (8999);
        seventh (9001);
        seventh ('nine thousand', 9000);
        seventh ();
    }

    function seventh(){
        eighth (8999);
        eighth (9001);
        eighth ('nine thousand', 9000);
        eighth ();
    }

    function eighth(){
        ninth (8999);
        ninth (9001);
        ninth ('nine thousand', 9000);
        ninth ();
    }

    function ninth (able, baker) {
        module.exports.tricky (able, baker);
    }
};
