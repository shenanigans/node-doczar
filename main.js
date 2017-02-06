
/*      @module
    Select, load and parse source files for `doczar` format documentation comments. Write json or
    rendered html output to a configured disk location.
@spare `README.md`
    This is the rendered output of the `doczar` source documentation.
    *View the [source](https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/

/*      @submodule Options
    Configuration options available to both module importers and command line users.
@member:Boolean dev
@member:Boolean api
@member:Boolean json
@member:Boolean raw
@member:Boolean noImply
@member:Boolean noDeps
@member:Boolean node
@member:Boolean jTrap
    @default true
@member:String verbose
    @default `"info"`
@member:String jsmod
@member:String in
@member:String out
    @default `"docs"`
@member:String with
@member:String code
    @default `"github"`
@member:String date
@member:String parse
@member:String locals
@member:String root
@member:String fileRoot
@member:Number maxDepth
    @default 4
@member:Number maxRefDepth
    @default 8
*/

module.exports = {
    ComponentCache:     require ('./src/ComponentCache'),
    Component:          require ('./src/Component'),
    Parser:             require ('./src/Parser'),
    Patterns:           require ('./src/Parser/Patterns'),
    Templates:          require ('./src/Templates')
};
