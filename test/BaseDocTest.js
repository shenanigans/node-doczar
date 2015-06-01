
require ('SecondDocTest');

/**     @module Test
    This is the implicit `@spare summary`.
@spare details
    These are the explicit `@spare details`.
*/

/**     @class Foo
    These are the implicit `@spare details`.
@spare summary
    This is the explicit `@spare summary`.
@constructor
    Automagic conversion of `@constructor` to `@spare constructor`.
@preconstructor
    Automagic conversion of `@preconstructor` to `@spare preconstructor`.
@property/Symbol able
    Simple [Symbol]() class prop.
@property/Symbol baker
    A second [Symbol]() class prop.
@property/Symbol [.Foo.baker]
    A third [Symbol]() class prop, itself stored on a [Symbol]().
@member/String charlie
    Simple [String]() member.
@member/String|Number|undefined multiType
    A multi-type member.
@member/.Foo localType
    A locally-rooted-type member.
@member/Object[String, Test.Foo] complexType
    A complex-type member.
@member/Object[String, Test.Foo]|Array[Test.Foo] complexMultiType
    A complex-multi-type member.
@member/Array[Test.Foo.[Test.Foo.able]] genericWithSymbol
    A member with a generic type that contains a symbol.
@member/String [Test.Foo.able]
    A member on a Symbol.
@property/String [.Foo.able]
    A property on a Symbol.
@spare [Test.Foo.able]~extra
    An extra document attached to a Symbol member with an inner declaration.
@spare #[Test.Foo.able]~extra
    An extra document attached to a Symbol member with an inner declaration.
*/

/**     @member/Function Foo#alfaMethod
    A method.
@argument/String fooArg
    A standard String argument.
@argument/Number|undefined barArg
    A standard Number or undefined argument.
@kwarg/Object[String, String] fooKwarg
    An Object keyword argument.
@kwarg/Number barKwarg
    A Number keyword argument.
@args/String lastFoos
    Last normal (semi-named) arguments.
@kwargs
    Last keyword arguments. The default name is used.
@kwargs/String
    More last keyword arguments, using the default name again.
*/

/**     @spare Foo.[Test.Foo.able]~fullExtra
    Another extra document attached to a Symbol member with a full declaration.
*/

/**     @spare Foo#[Test.Foo.able]~fullExtra
    Another extra document attached to a Symbol member with a full declaration.
*/

/**     @property/String Foo.[Test.Foo.[Test.Foo.baker]]
    A class property on a [Symbol]() that is on a recursively symbolic path.
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
