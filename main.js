
/*      @module
    Select, load and parse source files for `doczar` format documentation comments. Render html
    output to a disk location.
@spare `README.md`
    This is the rendered output of the `doczar` source documentation.
    *View the [source](https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/

module.exports = {
    ComponentCache:     require ('./src/ComponentCache'),
    Component:          require ('./src/Component'),
    Parser:             require ('./src/Parser'),
    Patterns:           require ('./src/Parser/Patterns'),
    Templates:          require ('./src/Templates')
};
