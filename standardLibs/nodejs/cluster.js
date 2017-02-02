
/*      @module Cluster
    Spawns groups of worker processes, sharing all network ports between them with automatic load
    distribution.
@spare `Library Documentation`
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster`
@event fork
    @remote `https://nodejs.org/api/cluster.html#cluster_event_fork`
@event online
    @remote `https://nodejs.org/api/cluster.html#cluster_event_online`
@event listening
    @remote `https://nodejs.org/api/cluster.html#cluster_event_listening`
@event disconnect
    @remote `https://nodejs.org/api/cluster.html#cluster_event_disconnect`
@event exit
    @remote `https://nodejs.org/api/cluster.html#cluster_event_exit`
@event setup
    @remote `https://nodejs.org/api/cluster.html#cluster_event_setup`
@member schedulingPolicy
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_schedulingpolicy`
@Object #settings
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_settings`
@Boolean #isMaster
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_ismaster`
@Boolean #isWorker
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_isworker`
@Function .setupMaster
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_setupmaster_settings`
@Function .fork
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_fork_env`
@Function .disconnect
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_disconnect_callback`
@.Worker #worker
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_worker`
@Object<.Worker> #workers
    @remote `https://nodejs.org/api/cluster.html#cluster_cluster_workers`
*/

/*      @class Worker
@spare `Library Documentation`
    @remote `https://nodejs.org/api/cluster.html#cluster_class_worker`
@event message
    @remote `https://nodejs.org/api/cluster.html#cluster_event_message`
@event online
    @remote `https://nodejs.org/api/cluster.html#cluster_event_online`
@event listening
    @remote `https://nodejs.org/api/cluster.html#cluster_event_listening`
@event disconnect
    @remote `https://nodejs.org/api/cluster.html#cluster_event_disconnect`
@event exit
    @remote `https://nodejs.org/api/cluster.html#cluster_event_exit`
@event error
    @remote `https://nodejs.org/api/cluster.html#cluster_event_error`
@String #id
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_id`
@child_process:ChildProcess #process
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_process`
@Boolean #suicide
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_suicide`
@Function #send
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_send_message_sendhandle`
@Function #kill
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_kill_signal_sigterm`
@Function #disconnect
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_disconnect`
@Function #isDead
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_isdead`
@Function #isConnected
    @remote `https://nodejs.org/api/cluster.html#cluster_worker_isconnected`
*/
