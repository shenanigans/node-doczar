
/**     @module tls
@spare `Library Documentation`
    @remote `https://nodejs.org/api/tls.html#tls_tls_ssl`
@spare `Protocol Support`
    @remote `https://nodejs.org/api/tls.html#tls_protocol_support`
@spare `Client-Initiated Renegotiation Attack Mitigation`
    @remote `https://nodejs.org/api/tls.html#tls_client_initiated_renegotiation_attack_mitigation`
@spare `NPN and SNI`
    @remote `https://nodejs.org/api/tls.html#tls_npn_and_sni`
@spare `Perfect Forward Secrecy`
    @remote `https://nodejs.org/api/tls.html#tls_perfect_forward_secrecy`
@Function getCiphers
    @remote `https://nodejs.org/api/tls.html#tls_getciphers`
@Function createServer
    @remote `https://nodejs.org/api/tls.html#tls_createserver_options_secureconnectionlistener`
@Function connect
    @remote `https://nodejs.org/api/tls.html#tls_connect_options_callback`
@Function connect
    @remote `https://nodejs.org/api/tls.html#tls_connect_port_host_options_callback`
@Function createSecureContext
    @remote `https://nodejs.org/api/tls.html#tls_createsecurecontext_details`
@Function createSecurePair
    @remote `https://nodejs.org/api/tls.html#tls_createsecurepair_context_isserver_requestcert_rejectunauthorized`
*/

/**     @class SecurePair
@spare `Library Documentation`
    @remote `https://nodejs.org/api/tls.html#tls_class_securepair`
@event secure
    @remote `https://nodejs.org/api/tls.html#tls_event_secure`
*/

/**     @class Server
@spare `Library Documentation`
    @remote `https://nodejs.org/api/tls.html#class_tls_server`
@event secureConnection
    @remote `https://nodejs.org/api/tls.html#tls_event_secureconnection`
@event clientError
    @remote `https://nodejs.org/api/tls.html#tls_event_clienterror`
@event newSession
    @remote `https://nodejs.org/api/tls.html#tls_event_newsession`
@event resumeSession
    @remote `https://nodejs.org/api/tls.html#tls_event_resumesession`
@event OCSPRequest
    @remote `https://nodejs.org/api/tls.html#tls_event_ocsprequest`
@Function #listen
    @remote `https://nodejs.org/api/tls.html#tls_server_listen_port_host_callback`
@Function #close
    @remote `https://nodejs.org/api/tls.html#tls_server_close`
@Function #address
    @remote `https://nodejs.org/api/tls.html#tls_server_address`
@Function #addContext
    @remote `https://nodejs.org/api/tls.html#tls_server_addcontext_hostname_context`
@Number #maxConnections
    @remote `https://nodejs.org/api/tls.html#tls_server_maxconnections`
@Number #connections
    @remote `https://nodejs.org/api/tls.html#tls_server_connections`
*/

/**     @class CryptoStream
@spare `Library Documentation`
    @remote `https://nodejs.org/api/tls.html#tls_class_cryptostream`
@Number #bytesWritten
    @remote `https://nodejs.org/api/tls.html#tls_cryptostream_byteswritten`
*/

/**     @class TLSSocket
@spare `Library Documentation`
    @remote `https://nodejs.org/api/tls.html#tls_class_tls_tlssocket_1`
@event secureConnect
    @remote `https://nodejs.org/api/tls.html#tls_event_secureconnect`
@event OCSPResponse
    @remote `https://nodejs.org/api/tls.html#tls_event_ocspresponse`
@Boolean #encrypted
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_encrypted`
@Boolean #authorized
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_authorized`
@Error #authorizationError
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_authorizationerror`
@Function #getPeerCertificate
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_getpeercertificate_ detailed `
@Function #getCipher
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_getcipher`
@Function #renegotiate
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_renegotiate_options_callback`
@Function #setMaxSendFragment
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_setmaxsendfragment_size`
@Function #getSession
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_getsession`
@Function #getTLSTicket
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_gettlsticket`
@Function #address
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_address`
@String #remoteAddress
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_remoteaddress`
@String #remoteFamily
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_remotefamily`
@Number #remotePort
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_remoteport`
@String #localAddress
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_localaddress`
@Number #localPort
    @remote `https://nodejs.org/api/tls.html#tls_tlssocket_localport`
*/
