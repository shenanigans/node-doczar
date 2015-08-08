
/**     @module InheritenceTest */
/**     @property/symbol hello */
/**     @property/symbol goodbye */
/**     @class parent
    Parent class.
@property/String foo
@property/Function bar
@property/String foozle
@property/Function barzle
@member/Number baz
@member/Function bilge
    @argument/String cheese
    @returns/Number
@member/Function water
    @argument/String cheese
    @returns/Number
@property/Number [.hello]
    The [[hello\]](.hello) symbol static prop.
@member/Function [.hello]
    The [[hello\]](.hello) symbol member.
@member/Function [.goodbye]
    The [[goodbye\]](.goodbye) symbol member.
*/

/**     @class child
    @super .parent
    Child class of [parent](.parent). Inherited [crosslink test](.child#baz).
@member/Function water
    @argument/Number blob
    @returns/String
@property/Function foozle
@property/String barzle
@member/Function [.goodbye]
    The [[goodbye\]](.goodbye) symbol member *override*.
*/
