
/**     @module/class test
    Just a few tricky names to make sure that parser changes don't break anything. Also to guide
    development of support for `` `very complex`.`backtick paths` `` which the first solution did not
    cover.
@member/class `backtick name #9, #9, #9...`
@member/Function `backtick method #57`
@property/String `escape \` challenge 1`
@property/String `escape\ \` challenge 2`
@property/String `escape\ \\\` challenge 3`
*/
/**     @member/String `backtick name #9, #9, #9...`.foobar
    Strange directory issue on windows test.
*/
/**     @argument/String #`backtick method #57`(`backtick argument!`
    This is an argument of the `` `backtick method #57` `` function.
*/
/**     @class `Funky Class` */
/**     @member/Function `Funky Class`.`cheddar \`method\``
    Cheese!
@argument/String fooArg
    Foo arg.
@argument/.`Funky Class`|String `Funky Arg`
    Funky arg.
*/
/**     @member/.`Funky Class` `Funky Member`
    Etc.
*/
