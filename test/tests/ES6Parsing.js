
import * as Foo from "ES6Modules/Foo.js"
import {Able, Bar, Baker as Charlie} from "ES6Modules/Bar.js"

Bar (true);

// Should stick to Foo.bar
Foo.bar = 9001;

/* Should stick to Able.stir */
Able.stir = 'String';

Charlie.arret = []; /*
   Should stick to
   Baker.arret
*/

class MasterClass {
    constructor (able, baker) {
        this.able = able;
        this.newMethod = (chez) => { this.baker = chez };
        (function(){
            this.cheddar = 'cheese'; // MUST NOT BE VISIBLE
        })();
    }
    simpleMethod (able, baker, charlie) {
        var empty = 'foo';
        var commented = 'bar'; // comment
        var complex = {
            foo:    9, // comment
            bar:    10
        };
        return 9001;
    }
    shineThrough (able) {
        return [];
    }
}

class StudentClass extends MasterClass {
    constructor (foo, bar, able, baker) {
        super (able, baker);
        this.dog = 'good dog';
    }
    simpleMethod (able, baker, charlie) {
        return super.simpleMethod (able, baker, 'charlie');
    }
}

var BadStudentClass = class extends MasterClass {
    shineThrough (baker) {
        return super.shineThrough (4);
    }
}

var beta = new StudentClass (9);
beta.newMethod ('nine');
