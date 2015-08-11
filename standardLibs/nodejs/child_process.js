
/**     @module child_process
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process`
@member/Function exec
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback`
@member/Function execFile
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_execFile_file_args_options_callback`
@member/Function fork
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulePath_args_options`
@spare `Synchronous Process Creation`
    @remote `https://nodejs.org/api/child_process.html#child_process_synchronous_process_creation`
@member/Function spawnSync
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_spawnSync_command_args_options`
@member/Function execFileSync
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_execFileSync_command_args_options`
@member/Function execSync
    @remote `https://nodejs.org/api/child_process.html#child_process_child_process_execSync_command_options`
*/
/**     @submodule/class ChildProcess
    @remote https://nodejs.org/api/child_process.html#child_process_class_childprocess
@event error
    @remote `https://nodejs.org/api/child_process.html#child_process_event_error`
@event exit
    @remote `https://nodejs.org/api/child_process.html#child_process_event_exit`
@event close
    @remote `https://nodejs.org/api/child_process.html#child_process_event_close`
@event disconnect
    @remote `https://nodejs.org/api/child_process.html#child_process_event_disconnect`
@event message
    @remote `https://nodejs.org/api/child_process.html#child_process_event_message`
@member/stream.Writable stdin
    @remote `https://nodejs.org/api/child_process.html#child_process_child_stdin`
@member/stream.Readable stdout
    @remote `https://nodejs.org/api/child_process.html#child_process_child_stdout`
@member/stream.Readable stderr
    @remote `https://nodejs.org/api/child_process.html#child_process_child_stderr`
@member/Array<stream> stdio
    @remote `https://nodejs.org/api/child_process.html#child_process_child_stdio`
@member/Number pid
    @remote `https://nodejs.org/api/child_process.html#child_process_child_pid`
@member/Boolean connected
    @remote `https://nodejs.org/api/child_process.html#child_process_child_connected`
@member/String kill
    @remote `https://nodejs.org/api/child_process.html#child_process_child_kill`
@member/Function send
    @remote `https://nodejs.org/api/child_process.html#child_process_child_send`
@spare `Example: sending server object`
    @remote `https://nodejs.org/api/child_process.html#child_process_example_sending_server_object`
@spare `Example: sending socket object`
    @remote `https://nodejs.org/api/child_process.html#child_process_example_sending_socket_object`
@member/Function disconnect
    @remote `https://nodejs.org/api/child_process.html#child_process_child_disconnect`
@spare `Asynchronous Process Creation`
    @remote `https://nodejs.org/api/child_process.html#child_process_asynchronous_process_creation`
child_process.spawn(command[, args][, options])
*/
/**     @submodule/class Options
@member/ cwd
    String Current working directory of the child process.
@member/ env
    Object Environment key-value pairs.
@member/ encoding
    String (Default: 'utf8').
@member/ shell
    String Shell to execute the command with (Default: '/bin/sh' on UNIX, 'cmd.exe' on Windows, The
    shell should understand the -c switch on UNIX or /s /c on Windows. On Windows, command line
    parsing should be compatible with cmd.exe.).
@member/ timeout
    Number (Default: 0).
@member/ maxBuffer
    Number (Default: 200*1024).
@member/ killSignal
    String (Default: 'SIGTERM').
@member/ uid
    Number Sets the user identity of the process. (See setuid(2).).
@member/ gid
    Number Sets the group identity of the process. (See setgid(2).).
@member/String|Array stdio
    @remote `https://nodejs.org/api/child_process.html#child_process_options_stdio`
@member/Boolean detached
    @remote `https://nodejs.org/api/child_process.html#child_process_options_detached`
*/
