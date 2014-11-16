doczar
======
   | Table Of Contents
---|-------------------------------
 1 | [Installation](#installation)
 2 | [Shell Usage](#shell-usage)
 3 | [API](#api)
 4 | [Examples](#examples)
 5 | [Components And Modifiers](#components-and-modifiers)
 6 | [Major To-Do Items](#major-to-do-items)
 7 | [License](#license)

Doczar (pronounced **dozer**) is a simple, explicit documentation generator for javascript, python,
ruby, java and other languages which support c-like block comments.

Rather than attempting to document the source code itself, doczar **only** uses tagged comments. The
comment format has been designed for legibility and uses a simple scope model to make documenting
large, complex entities easy.

Doczar itself is fully cross-platform, open source, and *totally sweet*.

###Features
 * describe modules and object-oriented structures
 * inheritence, multiple inheritence and Java `interface`
 * Github-flavored markdown with syntax highlighting
 * semi-automatic crosslinking
 * callbacks and events
 * multiple return values and keyword arguments
 * automatic Node.js [dependency graph](https://github.com/defunctzombie/node-required) documentation

###Coming Soon
 * Function signatures
 * standard libs for javascript, node, the browser, java, and python

###Development
`doczar` is developed and maintained by Kevin "Schmidty" Smith under the MIT license. I am currently
broke and unemployed. If you want to see continued development on `doczar`, please help me
[pay my bills!](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PN6C2AZTS2FP8&lc=US&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)

Installation
------------
You will need [node.js and npm](http://nodejs.org/).
```shell
$ sudo npm install -g doczar
```
The binary `doczar` is now on your executable path.


Shell Usage
-----------
```shell
$ doczar --in=src/**/*.c --out docz
$ doczar --jsmod ./main # outputs to ./docs
```
option          | description
----------------|---------------------------------
o, out          | Selects a directory to fill with documentation output. The directory need not exist or be empty.
i, in           | Selects files to document. Parses nix-like wildcards using [glob](https://github.com/isaacs/node-glob).
j, js, jsmod    | Loads the filename with [required](https://github.com/defunctzombie/node-required) and documents every required source file.
dev             | Display Components marked with the @development flag.
api             | Display **only** Components marked with the @api flag.
v, verbose      | Output detailed information about the documentation process.


Examples
--------
The simplest form of document comment: a single [declaration](#doc-comment-syntax) in its own block
comment.
```c
/**     @class FooBox
    Represents a box of foos.
*/
```

The easiest way to document something a little more interesting is to use inner Declarations. All
inner Declarations affect the parent Declaration, not the one immediately above. You can use a
forward slash after a Component type to add value types to a Component, and use the pipe character
to chain multiple value types onto the same Component.

Each documentation string between the declaration lines is rendered in the final output as a
markdown document. Prior to rendering, indentation is normalized by eliminating the longest-possible
identical string of whitespace characters from the begining of every line in each document. Simply:
if every line starts with 8 spaces, it will be rendered as starting with none. Whitespace is ignored
on declaration lines.
```c
/**     @class FooBox
    Represents a box of foos.
@argument/Number maxCount
    The maximum number of foos to store.
@member/Number count
    The current number of foos in this `FooBox`.
@member/foo|undefined latest
    The most recent foo added to this `FooBox`.
```

The `@module` declaration has an infectious scope. Every subsequent decaration in the current source
file is automatically the child of the declared `module`.
```c
/**     @module foocontainers
    An assortment of useful collections for storing foos.
*/
/**     @class FooBox
    Represents a box of foos.
*/
```

Function-related declarations have a special scope. `argument` and `callback` declarations apply to
the most recently declared `Component`. Adding one or more `returns` declarations will manually
close the scope.
```c
/**     @class FooBox
    Represents a box of foos.
@member/Function storeFoo
    Add a foo to this box.
    @argument/foo foo
        The foo to store.
    @callback okCall
        Called back if the operation completes successfully.
        @argument/Number count
            The current number of foos stored in this box.
        @returns
    @callback errCall
        Called back if the operation fails. `okCall` will not be called.
        @argument/Error err
            The Error that caused the operation to fail.
        @returns
    @returns String
        A friendly status message.
*/
```

To specify multiple return values, you must specify names. A `@returns` Declaration with no type or
name only closes the argument scope.
```python
class FooBox:
    '''     @class FooBox
        Represents a box of foos.
    @member/Function storeFoo
        Add a foo to this box.
        @argument/foo foo
            The foo to store.
        @callback okCall
            Called back if the operation completes successfully.
            @argument/Number count
                The current number of foos stored in this box.
            @returns
        @returns/Array|None warnings
            An Array of warning messages, or `None`.
        @returns/String
            A friendly status message.
        @returns
    @member/Number count
        Total number of foos stored in the box.
    '''
```

Nearly every `Component` we declare has its own addressable path. Here we will add an additional
document to several children of a `Component` by selecting them by path in a second file. A `spare`
is simply an extra named markdown document which is associated with another `Component`.
```c
/**     @module foocontainers
    An assortment of useful collections for storing foos.
*/
/**     @class FooBox
    Represents a box of foos.
@spare additionalInfo
    Some more information about `FooBox` intances.
@property/Array allBoxes
    An Array of all `FooBox` instances with at least one `foo` inside.
@member/Function storeFoo
    Add a foo to this box.
    @argument/foo foo
        The foo to store.
    @callback callback
        @argument/Error err
            The Error which caused the operation to fail.
        @returns
    @returns/String
        A useful status message.
*/
```
```c
/**     @module foocontainers
@spare FooBox~additionalInfo
    This content will be added to the `spare` called "additionalInfo".
@spare FooBox.allBoxes~moreInfo
    A new `spare` is declared on the property `FooBox.allBoxes`.
@spare FooBox#storeFoo~moreInfo
    A new `spare` is declared on the method `FooBox#storeFoo`.
@spare FooBox#storeFoo(foo~moreInfo
    A new `spare` is declared on the argument `FooBox#storeFoo(foo`.
@spare FooBox#storeFoo{callback~moreInfo
    A new `spare` is declared on the callback function `FooBox#storeFoo{callback`.
@spare FooBox#storeFoo{callback(err~moreInfo
    A new `spare` is declared on the callback function's argument `FooBox#storeFoo{callback(err`.
@spare FooBox#storeFoo)~moreInfo
    A new `spare` is declared on the first return value of `FooBox#storeFoo`.
*/
```

You can specify shorter documentation for a complex `Component` by adding a `spare` called
"summary". The summary will be used whenever the `Component` is documented as a child. You may also
manually specify the "details" spare, instead.
```c
/**     @module foocontainers

    -- long documentation goes here --

@spare summary
    An assortment of useful collections for storing foos.
*/
/**     @class FooBox
    A box of foos.
@spare details

    -- long documentation goes here --

*/
```

Since path delimiters imply the type of their `Component`, you can usually just jump right to the
value type. The default type is `property` so the leading delimiter may even be ommitted for static
properties. You cannot open a new comment with this syntax, nor can you use it to create a `module`.
```c
/**     @class FooBox
@Array .allBoxes
    The unique name of this box.
@FooBox|undefined newestBox
    The most recently-created `FooBox` instance, if any.
@Function #storeFoo
    Add a foo to this box.
*/
```

Type names also support generics.
```c
/**     @class NameList
    A list of names and addresses.
@Array[String] #names
@Object[String, String] #addresses
*/
```

To help make your documentation easier to navigate, doczar supports automatic links to another
`Component`. An additional note about value types: if you start a type with a delimiter
character, it is scoped to the link's position in the current file. It is **not** scoped to the
surrounding declaration.
```c
/**     @module NoduleHeap
    A monad heap of [Nodule](.Nodule) instances. Not to be confused with
    [NoduleChain](NoduleChain) or its [Nodules](NoduleChain.Nodule).
*/
/**     @class Nodule
    A data unit containing arbitrary information.
*/
```
```c
/**     @module NoduleChain
    A monad chain of [Nodule](.Nodule) instances. Not to be confused with
    [NoduleHeap](NoduleHeap) or its [Nodules](NoduleHeap.Nodule).
*/
/**     @class Nodule
    A data unit containing arbitray information.
@property/.Nodule first
    This is scoped to the current module.
*/
```

Reference the document scope itself with `.`
```c
/**     @module/class Nodule
    A graph node.
@member/. parent
    The parent [Nodule](.).
*/
```

Here are a few more opportunities to be lazy and ommit things.
```c
/**     @property/Function asynchronouslyGetString
    Fetch a string from the filesystem or something.
@String (format
    (this is an @argument/String declaration)
    How would you like your [String]()?
@callback
    @argument/Error
    @argument/String
        The fetched [String], formatted to order.
*/
```



Components and Modifiers
------------------------
###Components
 * `@spare` markdown document
 * `@module` organizational Component
 * `@interface` Java interfaces
 * `@class` instantiable class objects
 * `@property` static properties
 * `@member` instance properties
 * `@argument` optionally-named function or event arguments
 * `@kwarg` python-style keyword arguments
 * `@callback` callback functions
 * `@returns` optionally-named return values
 * `@event` event descriptions

###Modifiers
 * `@development` hides this Component unless the --dev flag is used
 * `@api` reveals this Component and its ancestors when the --api flag is used
 * `@optional` indicates something which need not exist (usually an argument)
 * `@super` inherits from a superclass
 * `@implements` associates an implemented Java interface
 * `@public`
 * `@protected`
 * `@private`
 * `@abstract`
 * `@final`
 * `@volatile`

Major To-Do Items
-----------------
* Java interfaces
* @event
* @throws

License
-------
The MIT License (MIT)

Copyright (c) 2014 Kevin "Schmidty" Smith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

