doczar
======
|    | Table Of Contents
|---:|-------------------------------
|  1 | [Installation](#installation)
|  2 | [Shell Usage](#shell-usage)
|  3 | [Development](#development)
|  4 | [Comment Syntax](#comment-syntax)
|  5 | [Components, Types and Paths](#components-types-and-paths)
|  6 | [Documents and Spares](#documents-and-spares)
|  7 | [Functions](#functions)
|  8 | [Inheritence](#inheritence)
|  9 | [Events and Errors](#events-and-errors)
| 10 | [Generics](#generics)
| 11 | [LICENSE](#license)

Doczar (pronounced **dozer**) is a simple, explicit documentation generator for javascript, python,
ruby, java, c-like languages, and others.

Rather than attempting to document the source code itself, doczar **only** uses tagged comments. The
comment format has been designed for legibility and uses a simple scope model to make documenting
large, complex entities easy.

Doczar itself is fully cross-platform, open source, and *totally sweet*.

####Features
 * describe modules and object-oriented structures
 * inheritence, multiple inheritence and Java `interface`
 * Github-flavored markdown with syntax highlighting
 * semi-automatic crosslinking
 * callbacks and events
 * multiple return values and keyword arguments
 * function signatures
 * automatic Node.js [dependency graph](https://github.com/defunctzombie/node-required) documentation

####Coming Soon
 * special `@spare` path for documenting a constructor separately from its class.
 * `@file` Components to encode file structure information
 * `@import` to mount java modules on more crosslink-friendly local paths
 * standard libs for javascript, node, the browser, java, ruby, and python



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
---------------:|---------------------------------
o, out          | Selects a directory to fill with documentation output. The directory need not exist or be empty.
i, in           | Selects files to document. Parses nix-like wildcards using [glob](https://github.com/isaacs/node-glob).
j, js, jsmod    | Loads the filename with [required](https://github.com/defunctzombie/node-required) and documents every required source file.
dev             | Display Components marked with the @development flag.
api             | Display **only** Components marked with the @api flag.
v, verbose      | Output detailed information about the documentation process.

The documentation for `doczar` is generated with `$ doczar --jsmod ./cli`.



Development
-----------
`doczar` is developed and maintained by Kevin "Schmidty" Smith under the MIT license. I am currently
broke and unemployed. If you want to see continued development on `doczar`, please help me
[pay my bills!](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PN6C2AZTS2FP8&lc=US&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)



Comment Syntax
--------------
###Declarations
The simplest form of documentation is a single Declaration in its own block comment with an
informational summary. The opening line of a block comment must contain only the characters opening
the comment, a Declaration and as many spaces and tabs as you want. On the next line you may begin
describing this unit of code with
[github-flavored markdown](https://help.github.com/articles/github-flavored-markdown/).

In languages with c-like block comments (don't forget css) it looks like this:
```c
/**     @class MyClass
    For compatibility purposes, c-like comments support any
    number of asterisks *immediately after the slash*.
*/
```

In python, any "triple" string literal that meets the first-line requirements is a document comment.
```python
def referenceMontyPython (skit):
    """     @property/function referenceMontyPython
        Either triple or triple-double is fine.
    """
```

Ruby users may use `=begin` and `=end` with the same rules.
```ruby
=begin  @module MyRubyGem
    I don't know very much about Ruby.
=end
```

Finally, HTML comments are also supported.
```html
<!--    @module SplashPage
    Guest user landing page with corporate logo and account login/registration tools.
-->
```

Indentation of a markdown section is automagically normalized to the least-indented line and you may
include any number of tab and space characters before any Declaration. Yes, the de-indenter is
clever enough to handle this scenario:
```c
/** @member/int foo
    A contracted document with
    little available horizontal
    space that needs a [link]
    (http://google.com) to a
    search engine.
*/
```

To add a child with a standalone doc comment, simply specify a
[complex path](#components-types-and-paths) of any length.
```c
/**     @class FooClass
    A simple class.
*/
/**     @property/Function FooClass.getDefault
    Get a new default instance of FooClass.
*/
/**     @returns/FooClass FooClass.getDefault)defaultInstance
    Returns a new instance with the default configuration.
*/
```


####Inner Declarations
Once you have opened a declaration, you may write additional declarations which will all be scoped
to the enclosing comment.

```c
/**     @class MyClass
    A simple class.
@property/Function getAllInstances
    A static Function that returns all instances of MyClass.
@member/Function doSomethingCool
    A member Function on each instance of MyClass.
*/
```


####Modules
The `@module` Declaration has an infectious scope. Every Declaration after it is scoped to the
module Component, as are locally-rooted value types. (see [crosslinking](#crosslinking))
```c
/**     @module Foo
    The Foo module.
*/
/**     @class Bar
    The Foo.Bar class.
*/
```


####Value Types
A value type is declared with a forward slash. Multiple value types are declared with the pipe `|`
character.
```c
/**     @property/String foobar
    A String property called "foobar".
*/
/**     @property/Number|undefined result
    This property may be either a Number or `undefined`.
*/
```


####Modifiers and Flags
Modifiers, and their simpler counterpart Flags, are statements which modify the Declaration directly
above them rather than declaring a new Component. Modifiers have serious consequences for the
visibility and position of a Component and its children. Flags just render literally as helpful
keywords in a contrasting color.
```c
/**     @class MyClass
    @super LisasClass
    @public
    A simple subclass of Lisa's class.
@member/String uniqueID
    @const
    This id String is generated at instantiation and because
    it is constant, it will never give you up, never let you
    down.
*/
```

Here is a list of the available Modifiers and Flags
#####Modifiers
 * `@development` hides this Component unless the --dev flag is used
 * `@api` reveals this Component and its ancestors when the --api flag is used
 * `@optional` indicates something which need not exist (usually an argument)
 * `@super` inherits from a superclass
 * `@implements` associates an implemented Java interface

#####Flags
 * `@public`
 * `@protected`
 * `@private`
 * `@abstract`
 * `@final`
 * `@volatile`



Components, Types and Paths
---------------------------
Let's look at all the Components we have available.

#####Primary Components
These are the only Components which may be used to open a new document comment.
 * `@module` organizational Component
 * `@class` instantiable class objects
 * `@interface` Java interface
 * `@spare` bare markdown document
 * `@property` static property
 * `@member` instance property or method
 * `@event` event descriptions
 * `@throws` conditions causing an exception to be thrown
 * `@enum` list of named values


#####Inner Components
These may only appear inside a document comment opened by a Primary Component Declaration.
 * `@argument` optionally-named function or event argument
 * `@kwarg` python-style keyword argument
 * `@callback` callback function
 * `@returns` return value
 * `@signature` an alternate function signature
 * `@named` a named value in an `@enum`.

Many of these Component types have their own special path delimiters. This lets us reference more
things as paths than in any other document generator. Here they are:

#####Special Delimiters
 * `~` `@spare`
 * `.` `@property`
 * `#` `@member`
 * `(` `@argument`
 * `)` `@returns`
 * `!` `@throws`
 * `+` `@event`
 * `&` `@signature`

You can use a name starting with a delimiter to imply the Component type of any Inner Declaration,
skipping directly to the value type. You may do this with any of the types listed above as an
entirely optional feature. My personal recommendation is to use it only for `@property` and
`@member`.

The default delimiter is `"."`, for `@property`.
```c
/**     @class MyClass
@Function .getAllInstances
    Load all instances of MyClass.
@Number count
    Total number of instances.
@String #uniqueID
    The unique identifier of this MyClass instance.
@Error !EnvironFailure
    Throws an Error during instantiation if the local
    environment is configured incorrectly.
@String (uniqueID
    A unique identifier to instantiate with.
*/
```


#####Crosslinking
You can easily crosslink to any other defined Component using the normal markdown link syntax. If
you start a crosslink path with a delimiter, the target will be rooted to the current module scope.

Furthermore, every defined Component is also a valid type, and the same rule applies when starting a
type path with a delimiter.
```c
/**     @module MyModule
    A simple module.
*/
/**     @class MyClass
    A simple class.
*/
/**     @property/Function clone
@argument/.MyClass source
    The [MyClass](.MyClass) instance to clone.
@returns/MyModule.MyClass
    The fresh [MyClass](MyModule.MyClass) instance.
*/
```



Documents and Spares
--------------------
You may Declare a Component any number of times. Child Components and documentation accumulates in
the order in which it is loaded.
```c
/**     @class MyClass
    Some information about MyClass.
*/
/**     @class MyClass
    Some (more) information about MyClass.
*/
```

Available exclusively as an Inner Declaration, `@load` allows you to pull in an external markdown
document. Because in loaded docs it's valuable to support html hash links , i.e.
`[more info](#more-info)`, it is impossible to properly support localized paths when using `@load`.
Your links will be scoped to the global namespace and any type link starting with a delimiter will
be rejected.

This example is taken directly from the `doczar` doc comments.
```c
/**     @module doczar
    Select, load and parse source files for `doczar`-format
    documentation comments. Render html output to a
    configured disk location.
@spare README
    This is the rendered output of the `doczar` source
    documentation. *View the [source]
    (https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/
```


In the first stage of rendering, the markdown document(s) on a Component are moved into new `@spare`
instances. The normal documentation appearing after a Declaration is moved to the path `~summary`.
When available, `~summary` is used when a Component is displayed on another Component's output page,
and `~details` is used on a Component's own page. If you choose to manually specify only one of
these two paths, all accumulated documentation not associated with a `@spare` will default to the
unspecified path. When both paths are specified, unassociated documentation is appended to
`~details`.

There is no limit to how many spares a Component may have, however their titles are subject to
normal namespace restrictions (sorry).
```c
/**     @class FooClass
    Basic information.
@spare details
    Detailed information.
*/
/**     @class FooClass
    More basic information.
*/
/**     @class BarClass
    Detailed information.
@spare summary
    Basic information.
*/
/**     @class BarClass
    More detailed information.
*/
```



Functions
---------
The Inner Declarations `@argument`, `@kwarg`, `@callback`, `@signature` and `@returns` are used to
describe Functions. During parsing, these Components have special scoping which is designed to help
intuitively document an entire Function in one tag. Never forget that this special scope *only*
affects these Component types *exclusively*. The scope will be immediately reset by the first
normal Declaration.

Here is a simple Function Declaration with `@argument` and `@returns` declarations. You may name
your arguments and return values, or not.
```c
/**     @property/Function doTheDew
    Do the Dew until you can't even.
@argument/Number volume
    Volume of Dew to do, in fluid ounces.
@argument/String method
    How to do the Dew.
@returns/String message
    Returns a hip phase, such as "Totally radical!!!".
*/
```

```c
/**     @property/Function sortItems
    A sorting function for Item instances.
@argument/Item
    The first Item.
@argument/Item
    The second Item.
@returns/Number
    -1, 0, or 1.
*/
```

Keyword arguments are as easy as replacing `@argument` with `@kwarg`.
```c
/**     @property/Function tellParrotJoke
    Repeat some Monty Python jokes about a parrot.
@kwarg/String parrotType
    Type of parrot to joke about.
*/
```


#####Callback Functions
The `@callback` Declaration expands the `@argument` scope in order to document the callback
Function's arguments. You may reclose this scope with any unnamed `@returns` Declaration. You may
name your callbacks, or not.
```c
/**     @property/Function loadDefinitions
    Load definition file from the remote server.
@argument/String hostname
    URL of the remote server.
@callback
    @argument/Error|undefined error
        If a fatal Error prevented the file from
        being loaded properly, it is passed to
        the callback.
    @argument/Buffer|undefined definitionsFile
        The loaded definitions file, or `undefined`
        if an Error occured.
    @returns
@argument/Boolean devLogging
    @optional
    Activate development-mode logging messages.
*/
```

Although I've never seen this pattern used, it is possible to document multiple (pythonic)
`@returns` Declarations on a `@callback`. You can still close the scope manually with a blank
`@returns` Declaration.
```c
/**     @property/Function getJiggyWithIt
    Get jiggy with it.
@callback onError
    Called if a fatal Exception occured.
    @returns/function responseAction
        What to do about the Exception.
    @returns/Number priority
        How important this reaction is.
    @returns
@callback onSuccess
    Called if we got jiggy successfully.
    @argument/Number jigginessLevel
        Maximum level of jigginess achieved.
*/
```


#####Function Signatures
If you're writing an overloaded function with multiple signatures or need to document special
permutations of optional arguments, `@signature` is there for you. It redefines the return value and
argument signature and documents the signature separately.

When you create a `@signature` with an Inner Declaration, the scope rules for Functions and
`@argument` Components apply.
```c
/**     @property/Function writeBuffer
    Interprets the contents of a Buffer as UTF-8
    and writes it in the sky with smoke signals.
@signature/Number (content)
    Write out the entire Buffer and return the
    number of bytes written.
@signature/Number|undefined (content, bytes)
    Write up to `bytes` bytes of text from
    `content`. If there is content remaining,
    returns the number of unwritten bytes.
@argument/Buffer content
    Text content to skywrite.
@argument/Number bytes
    Limit output to a set number of bytes.
*/
```

Signatures may be declared in their own comments.
```c
/**     @signature writeBuffer (content, bytes)
    Write up to `bytes` bytes of text from `content`.
    If there is content remaining, returns the number
    of unwritten bytes.
```

You may also define a signature with value types. These types have no additional implications, they
are only displayed in the documentation (and crosslinked).
```c
/**     @property/Function write
    Output information through the Morse telegram interface.
@argument content
    The content to send.
@signature (String content)
    Send the content as ascii text, followed by `STOP`.
@signature (Number content)
    Convert the number to ascii text and send, followed
    by `STOP`.
@signature (Array[String] content)
    Send each message, delimited and terminated with
    `STOP`.
*/
```

Signatures cannot be inherited or overridden individually.



Inheritence
-----------
To inherit static and member properties from another Component of any type, use the `@super`
modifier.
```c
/**     @class BaseClass
    A simple base class.
@Function createDefault
    Create and return a default instance.
    @returns/.BaseClass
@Function #toString
    Produce a String representation of this instance.
*/
/**     @class SubClass
    A simple subclass.
@Function #toString
    Overrides `BaseClass#toString`.
*/
```

If a Component with a superclass also has at least one value type that is exactly `"function"` or
`"Function"`, it will also inherit arguments, signatures, return values and thrown exceptions.

Java interfaces are also supported, with `@interface` and `@implements`.
```c
/**     @interface UniversalRemote
    The common interface for a universal remote control.
@member/Function volumeUp
    Increase speaker volume.
@member/Function volumeDown
    Decrease speaker volume.
*/
/**     @class Tamtung_Model042_3
    @implements .UniversalRemote
@member/Function volumeUp
    Increase speaker volume.
@member/Function volumeDown
    Decrease speaker volume.
*/
```



Events and Errors
-----------------
Document events with the `@event` declaration. Pass information with your Event by attaching
`@argument` Components.
```c
/**     @class Element
    An HTML DOM Element.
@event click
    Sent when a user presses down and releases the
    same mouse button within the bounding box of this
    Element, without exceeding the host browser's
    minimum threshold for [drag](Element+drag) events.
    Unless cancelled, this event bubbles upward and
    occurs in parent Elements until the `document` is
    reached.
    @argument/MouseEvent
        The originating mouse event.
*/
```

Cases which cause exceptions to be thrown may be documented with the simple Declaration `@throws`.
You may name your exception cases, or not.
```python
class dict:
    """     @class dict
        A hash map of Strings to untyped references.
    """
    def get (self, key):
        """     @member/function dict#get
            Retrieve a reference.
        @throws/KeyError notFound
            Failure to find a key results in an exception.
        @throws/TypeError
            If the key reference does not implement
            `__hash__`, a TypeError is raised.
        """
```





Generics
--------
Type paths support generics (java), templates (c++) and arrays-of-things (javascript). You may
specify any number of generic types on any type path, including with the use of multiple types and
pipes `|`.
```c
/**     @property/Array[String]|undefined fooProp
    An Array of Strings, or undefined.
*/
```

#####Coming Soon
Generics in Class Declarations.
```c
/**     @class Container<Object elemType>
    A container of arbitrarily-typed references.
@function #get
    @argument/String elemName
        The name of the element to get.
    @returns/%elemType|null
        The requested element, or `null`.
*/
```



LICENSE
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

