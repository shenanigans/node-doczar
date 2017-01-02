
var foo = 'bar';
/*  @class Drinky
    The bar class.
*/
function bar (able, baker) {
    // barge info.
    var barge = 9; // Ignore.
    /* cheese
    info */
    this.cheese = "cheddar";
    this.cheese = 4;
    var self = this;
    self.intense = true; /* intense
    info */
    if (able)
        return 4;
    else
        return 'four';

    this.crashEverything = new bar();
    this.laterInst = new baz();
    this.laterDeref = this.laterInst.ok;
    this.redirected = 'forty'; /* @member Drinky#newRedirectedName
        Some summary info about the redirected name.
    */
    this.complex = {
        able:   9,
        baker:  {
            able:   10
        }
    };
    var tricky = this.complex;
    this.trickyDeref = tricky.baker.able;
    this.finalStuff = this.doStuff (9);

    setTimeout (function(){ self.block = { foo:'bar' }; }, 100);
};
bar.prototype.bilge = 'full';

bar.prototype.doStuff = function (able) {
    this.stuff = able;
    var jive = "turkey";
    this.ref = jive;
    // return 'five';
    return this.complex.baker.able;
};

function baz(){
    this.ok = false;
}

/*  @spare Drinky~final
    Trailing tag.
*/
