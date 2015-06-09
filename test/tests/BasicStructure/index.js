
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
@property/Number alfa
@member/String alfa
    Simple [String]() member.
@member/String|Number|undefined multiType
    A multi-type member.
@member/.Foo localType
    A locally-rooted-type member.
@member/Object[String, Test.Foo] complexType
    A complex-type member.
@member/Object[String, Test.Foo]|Array[Test.Foo] complexMultiType
    A complex-multi-type member.
*/
