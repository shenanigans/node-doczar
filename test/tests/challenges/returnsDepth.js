
function forgeClass(){
    /* info about the classlike */
    return function(){ this.foo = "bar"; };
}

/*  module info */
module.exports = forgeClass();
