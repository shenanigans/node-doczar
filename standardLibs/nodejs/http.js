
/**     @module http
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_http`
@Array<String> METHODS
    @remote `https://nodejs.org/api/http.html#http_http_methods`
@Object STATUS_CODES
    @remote `https://nodejs.org/api/http.html#http_http_status_codes`
@Function createServer
    @remote `https://nodejs.org/api/http.html#http_http_createserver_requestlistener`
@Function createClient
    @remote `https://nodejs.org/api/http.html#http_http_createclient_port_host`
@Function request
    @remote `https://nodejs.org/api/http.html#http_http_request_options_callback`
@Function get
    @remote `https://nodejs.org/api/http.html#http_http_get_options_callback`
@.Agent globalAgent
    @remote `https://nodejs.org/api/http.html#http_http_globalagent`
*/


/**     @class Server
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_class_http_server`
@event request
    @remote `https://nodejs.org/api/http.html#http_event_request`
@event connection
    @remote `https://nodejs.org/api/http.html#http_event_connection`
@event close
    @remote `https://nodejs.org/api/http.html#http_event_close`
@event checkContinue
    @remote `https://nodejs.org/api/http.html#http_event_checkcontinue`
@event connect
    @remote `https://nodejs.org/api/http.html#http_event_connect`
@event upgrade
    @remote `https://nodejs.org/api/http.html#http_event_upgrade`
@event clientError
    @remote `https://nodejs.org/api/http.html#http_event_clienterror`
@Function #listen
    @remote `https://nodejs.org/api/http.html#http_server_listen_port_hostname_backlog_callback`
@Function #listen
    @remote `https://nodejs.org/api/http.html#http_server_listen_path_callback`
@Function #listen
    @remote `https://nodejs.org/api/http.html#http_server_listen_handle_callback`
@Function #close
    @remote `https://nodejs.org/api/http.html#http_server_close_callback`
@Number #maxHeadersCount
    @remote `https://nodejs.org/api/http.html#http_server_maxheaderscount`
@Function #setTimeout
    @remote `https://nodejs.org/api/http.html#http_server_settimeout_msecs_callback`
@Number #timeout
    @remote `https://nodejs.org/api/http.html#http_server_timeout`
*/

/**     @class ServerResponse
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_class_http_serverresponse`
@event close
    @remote `https://nodejs.org/api/http.html#http_event_close_1`
@event finish
    @remote `https://nodejs.org/api/http.html#http_event_finish`
@Function #writeContinue
    @remote `https://nodejs.org/api/http.html#http_response_writecontinue`
@Function #writeHead
    @remote `https://nodejs.org/api/http.html#http_response_writehead_statuscode_statusmessage_headers`
@Function #setTimeout
    @remote `https://nodejs.org/api/http.html#http_response_settimeout_msecs_callback`
@Number #statusCode
    @remote `https://nodejs.org/api/http.html#http_response_statuscode`
@String #statusMessage
    @remote `https://nodejs.org/api/http.html#http_response_statusmessage`
@Function #setHeader
    @remote `https://nodejs.org/api/http.html#http_response_setheader_name_value`
@Boolean #headersSent
    @remote `https://nodejs.org/api/http.html#http_response_headerssent`
@Boolean #sendDate
    @remote `https://nodejs.org/api/http.html#http_response_senddate`
@Function #getHeader
    @remote `https://nodejs.org/api/http.html#http_response_getheader_name`
@Function #removeHeader
    @remote `https://nodejs.org/api/http.html#http_response_removeheader_name`
@Function #write
    @remote `https://nodejs.org/api/http.html#http_response_write_chunk_encoding_callback`
@Function #addTrailers
    @remote `https://nodejs.org/api/http.html#http_response_addtrailers_headers`
@Function #end
    @remote `https://nodejs.org/api/http.html#http_response_end_data_encoding_callback`
*/

/**     @class Agent
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_class_http_agent`
@Number #maxSockets
    @remote `https://nodejs.org/api/http.html#http_agent_maxsockets`
@Number #maxFreeSockets
    @remote `https://nodejs.org/api/http.html#http_agent_maxfreesockets`
@Object #sockets
    @remote `https://nodejs.org/api/http.html#http_agent_sockets`
@Object #freeSockets
    @remote `https://nodejs.org/api/http.html#http_agent_freesockets`
@Object #requests
    @remote `https://nodejs.org/api/http.html#http_agent_requests`
@Function #destroy
    @remote `https://nodejs.org/api/http.html#http_agent_destroy`
@Function #getName
    @remote `https://nodejs.org/api/http.html#http_agent_getname_options`
*/

/**     @class ClientRequest
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_class_http_clientrequest`
@event response
    @remote `https://nodejs.org/api/http.html#http_event_response`
@event socket
    @remote `https://nodejs.org/api/http.html#http_event_socket`
@event connect
    @remote `https://nodejs.org/api/http.html#http_event_connect_1`
@event upgrade
    @remote `https://nodejs.org/api/http.html#http_event_upgrade_1`
@event continue
    @remote `https://nodejs.org/api/http.html#http_event_continue`
@Function #flushHeaders
    @remote `https://nodejs.org/api/http.html#http_request_flushheaders`
@Function #write
    @remote `https://nodejs.org/api/http.html#http_request_write_chunk_encoding_callback`
@Function #end
    @remote `https://nodejs.org/api/http.html#http_request_end_data_encoding_callback`
@Function #abort
    @remote `https://nodejs.org/api/http.html#http_request_abort`
@Function #setTimeout
    @remote `https://nodejs.org/api/http.html#http_request_settimeout_timeout_callback`
@Function #setNoDelay
    @remote `https://nodejs.org/api/http.html#http_request_setnodelay_nodelay`
@Function #setSocketKeepAlive
    @remote `https://nodejs.org/api/http.html#http_request_setsocketkeepalive_enable_initialdelay`
*/

/**     @class IncomingMessage
@spare `Library Documentation`
    @remote `https://nodejs.org/api/http.html#http_class_http_incomingmessage`
@event close
    @remote `https://nodejs.org/api/http.html#http_event_close_2`
@String #httpVersion
    @remote `https://nodejs.org/api/http.html#http_message_httpversion`
@Object #headers
    @remote `https://nodejs.org/api/http.html#http_message_headers`
@Array #rawHeaders
    @remote `https://nodejs.org/api/http.html#http_message_rawheaders`
@Object #trailers
    @remote `https://nodejs.org/api/http.html#http_message_trailers`
@Array #rawTrailers
    @remote `https://nodejs.org/api/http.html#http_message_rawtrailers`
@Function #setTimeout
    @remote `https://nodejs.org/api/http.html#http_message_settimeout_msecs_callback`
@String #method
    @remote `https://nodejs.org/api/http.html#http_message_method`
@String #url
    @remote `https://nodejs.org/api/http.html#http_message_url`
@Number #statusCode
    @remote `https://nodejs.org/api/http.html#http_message_statuscode`
@String #statusMessage
    @remote `https://nodejs.org/api/http.html#http_message_statusmessage`
@net.Socket #socket
    @remote `https://nodejs.org/api/http.html#http_message_socket`
*/
