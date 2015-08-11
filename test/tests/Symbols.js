
/**     @module Test */
/**     @class Foo
    These are the implicit `@spare details`.
@property/Symbol able
    Simple [Symbol]() class prop.
@property/Symbol baker
    A second [Symbol]() class prop.
@property/Symbol [.Foo.baker]
    A third [Symbol]() class prop, itself stored on a [Symbol]().
@member/Array<Test.Foo.[Test.Foo.able]> genericWithSymbol
    A member with a generic type that contains a symbol.
@member/String [Test.Foo.able]
    A member on a Symbol.
@property/String [.Foo.able]
    A property on a Symbol.
@spare [Test.Foo.able]~extra
    An extra document attached to a Symbol member with an inner declaration.
*/
/**     @spare Foo.[Test.Foo.able]~fullExtra
    Another extra document attached to a Symbol member with a full declaration.
*/
/**     @class Bar
    @root
@property/Symbol alfa
    A static Symbol mapped to a String.
@property/Symbol [.alfa]
    A static Symbol mapped to a static Symbol.
@property/Symbol [.[.alfa]]
    Another static Symbol mapped to a static Symbol.
@member/String [Test.Bar.[Test.Bar.[Test.Bar.alfa]]]
    A String mapped to a static Symbol.
*/
