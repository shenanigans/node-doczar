
/**     @module Test */
/**     @class CaseClass
    @root
    This Class tests sanitization of links by case. It's a Windows thing.
    * [casePropAlfa](.casePropAlfa)
    * [CasePropAlfa](.CasePropAlfa)
    * [CasepropAlfa](.CasepropAlfa)
    * [casepropAlfa](.casepropAlfa)
    * [casepropalfa](.casepropalfa)
    * [CASEPROPALFA](.CASEPROPALFA)
@property/String casePropAlfa
    The first `@property` is only separated from its siblings by case.
@property/String CasePropAlfa
    The second `@property` is only separated from its siblings by case.
@property/String CasepropAlfa
    The third `@property` is only separated from its siblings by case.
@property/String casepropAlfa
    The fourth `@property` is only separated from its siblings by case.
@property/String casepropalfa
    The fifth `@property` is only separated from its siblings by case.
@property/String CASEPROPALFA
    The sixth `@property` is only separated from its siblings by case.
*/
/*      @spare casePropAlfa~fooSpare
    Foo bar baz.
*/
/*      @spare CasePropAlfa~fooSpare
    Foo bar baz.
*/
/*      @spare CasepropAlfa~fooSpare
    Foo bar baz.
*/
/*      @spare casepropAlfa~fooSpare
    Foo bar baz.
*/
/*      @spare casepropalfa~fooSpare
    Foo bar baz.
*/
/*      @spare CASEPROPALFA~fooSpare
    Foo bar baz.
*/
