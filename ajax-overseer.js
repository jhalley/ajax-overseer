
// overseer class
// Requires: jquery and bootstrap-alert.js
function ajax_overseer(fn_list){
    /* 
        Publicly accessible variables and methods
    */
    this.start_polling = start_polling;
    this.stop_polling = stop_polling;
    this.exec_once = exec_once;
    // for debugging
    this.ajax_function_list = function(){ return ajax_function_list; }
    this.ajax_status = function() { return ajax_status; }
    this.ajax_calls = function() { return ajax_calls; }
    this.ajax_settimeouts = function() { return ajax_settimeouts; }
    init();

    /* 
        Private variables and methods
    */
    var ajax_function_list = fn_list;
    var ajax_timers = [];
    var ajax_settimeouts = {};
    var ajax_calls = {};
    var backoff_values = [0, 2000, 4000, 8000, 16000, 32000, 64000, 128000];  // Leading zero is because trigger_delay starts at 0 and we do a +=. I don't want to start it at -1.
    /* 
        eg:
            ajax_status['ajax_fn_1'] = { 'status': 'ACTIVE', 'trigger_delay': 0, 'last_run': new Date() }

        Status codes:
        ACTIVE - Ajax function is waiting for end of interval to trigger again
        WAITING - Ajax function has been triggered and is waiting for return response from server
        TIMEDOUT - Ajax function has timedout previously. Initiate backoff algo.
    */
    var ajax_status = {};    


    // init function
    function init(){
        var alert_wrapper = '<div id="alert_wrapper" style="width:1px; float:right; z-index:9999999; position: fixed; top:0; right:0; overflow: visible; direction: rtl;"></div>';
        $('body').prepend(alert_wrapper);
    }

    // function preloader. Does initial loading, sets up the dictionary.
    function fn_preloader(x){
        ajax_status[x.fn_name] = {'status': 'ACTIVE', 'trigger_delay': 0, 'last_run': new Date()};
        exec_ajax(x);   // initial load of the function
    }
    
    // function that starts the ajax requests
    function start_polling(fn_name){
        try {
            fn_name = typeof fn_name !== 'undefined' ? fn_name: 'all'; // default value is 'all' if no fn_name given

            // set up timers for ajax updates 
            if (fn_name == 'all'){
                // stop all timers first
                if (!stop_polling()){
                    throw "stop_polling function failed!";
                }
                
                for (var i = 0; i < ajax_function_list.length; i++){
                    fn_preloader(ajax_function_list[i]);
                }
            } else {
                // stop timer first
                if (!stop_polling(fn_name)){
                    throw "stop_polling function failed!";
                }

                // locate the entry on ajax_function_timings
                var timing_entry;
                for (var i = 0; i < ajax_function_list.length; i++){
                    if (ajax_function_list[i].fn_name == fn_name){
                        timing_entry = i;
                        break;
                    }
                }
                if (typeof timing_entry == 'undefined'){
                    throw "function not found!";
                }

                fn_preloader(ajax_function_list[timing_entry]);
            }

            return true;
        } catch (err) {
            console.log('Start polling failed.');
            return false;
        }
    }

    // Clear timers 
    function stop_polling(fn_name){
        try {
            fn_name = typeof fn_name !== 'undefined' ? fn_name: 'all'; // default value is 'all' if no fn_name given

            if (fn_name == 'all'){
                for (timer in ajax_status){
                    ajax_calls[timer].abort();
                    clearTimeout(ajax_settimeouts[timer]);
                    delete ajax_status[timer];
                }
            } else {
                if (ajax_timers[fn_name] !== 'undefined') {
                    ajax_calls[fn_name].abort();
                    clearTimeout(ajax_settimeouts[fn_name]);
                    delete ajax_status[fn_name];
                } 
            }

            return true;
        } catch (err){
            console.log(err);
            console.log('Stop polling failed');
            return false;
        }
    }

    // timeout informer function
    function timeout_inform(x, delay){
        var delay_str = delay.toString();
        var rand_id = "timeout_informer" + Math.floor((Math.random() * 1000) + 1);
        var msg = '<div id="'+rand_id+'" class="alert alert-error" style="width: 300px;"><button type="button" class="close" data-dismiss="alert">×</button><div id="timeout_informer_body" style="padding-right: 30px; text-align: center;">';
        var msg_end = '</div></div>';
        var alert_msg = '';

        if (delay == -1){
            if ($('.server-error').length == 0){ // There is no server error message being displayed
                alert_msg = 'It appears that there is a problem reaching the server. Please refresh the page again after a while';    
                $('#alert_wrapper').prepend(msg + alert_msg + msg_end);
                $('#'+rand_id).addClass('server-error');
            } else {    // for debugging
                console.log('Server error message is already displayed.');
            }
        } else {
            alert_msg = '<strong>'+x.pretty_fn_name+' timed out!</strong> Retrying in <span id="'+rand_id+'_countdown">'+ delay_str.substr(0, delay_str.length - 3) + '</span>s</br>';
            $('#alert_wrapper').prepend(msg + alert_msg + msg_end);

            (function(){
                var countdown = parseInt(delay_str.substr(0, delay_str.length - 3));
                countdown.this_interval = setInterval(function(){   // assigning the setInterval to locally scoped countdown object
                    countdown--;
                    $('#'+rand_id+'_countdown').empty().append(countdown);
                    if (countdown == 1){
                        clearInterval(countdown.this_interval);
                    };
                }, 1000);
            })();

            setTimeout(function() {
                $("#"+rand_id).fadeOut().empty();
            }, delay-1);
        }
        $('.alert').alert();    // to enable the close functionality of the alert
    }

    // this function is used if you want to trigger the ajax function once but not make it poll
    // we need to duplicate the function entry on ajax_function_list but set the delay to -1
    // this way, it can run side by side with the original polling function
    function exec_once(fn_name){
        var x, clone, timing_entry;

        // locate the entry on ajax_function_timings
        for (var i = 0; i < ajax_function_list.length; i++){
            if (ajax_function_list[i].fn_name == fn_name){
                timing_entry = i;
                break;
            }
        }
        if (typeof timing_entry == 'undefined'){
            throw "function not found!";
        }

        // duplicate function, set interval to -1, change function name to '...'+'_runonce'
        clone = jQuery.extend(true, {}, ajax_function_list[timing_entry]); // deep copy method by john resig
        clone.interval = -1;
        clone.fn_name += '_runonce';

        // do the actual execution
        fn_preloader(clone);

    }

    // do ajax call function
    // TODO: clean up this function. It's a mess!
    function exec_ajax(x){
        if (ajax_status[x.fn_name].status == 'WAITING'){
            ajax_calls[x.fn_name].abort();  // Cancel ongoing ajax call
            ajax_status[x.fn_name].status = 'TIMEDOUT';
            ajax_status[x.fn_name].trigger_delay += 1;

            if (ajax_status[x.fn_name].trigger_delay >= backoff_values.length){
                console.log('It appears that there is a problem reaching the server. Please refresh the page again after a while.');
                timeout_inform(x, -1);
            } else {
                var delay = backoff_values[ajax_status[x.fn_name].trigger_delay];  // Because we need it in milliseconds 
                timeout_inform(x, delay);
                console.log('Retrying in: ' + delay);
                // TODO: think of a better way to do this
                ajax_settimeouts[x.fn_name] = setTimeout(function(){exec_ajax(x);}, delay);
            }
            
        } else if ((ajax_status[x.fn_name].status == 'TIMEDOUT') || (ajax_status[x.fn_name].status == 'ACTIVE')) {
            ajax_status[x.fn_name].status = 'WAITING';
            ajax_status[x.fn_name].last_run = new Date();
            ajax_calls[x.fn_name] = $.ajax(
                    {url: typeof x.url == 'function' ? x.url():x.url, dataType: x.dataType, timeout: x.timeout, beforeSend: x.beforeSend, success: x.success, error: x.error}
                ).done(function(){
                    ajax_status[x.fn_name].status = 'ACTIVE';
                    ajax_status[x.fn_name].trigger_delay = 0;
                    clearTimeout(ajax_settimeouts[x.fn_name]);
                    if (x.interval != -1){
                        ajax_settimeouts[x.fn_name] = setTimeout(function(){exec_ajax(x);}, x.interval);
                    }
                }).fail(function(){
                    exec_ajax(x);
                });
            // TODO: need to handle the possible error return!
        }

    }

    // function that sets up function polling
    function Timer(x){
        return window.setInterval(
            function(){exec_ajax(x)}, x.interval);
    };
}
