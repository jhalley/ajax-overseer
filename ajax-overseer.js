
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
    this.polling_list = function(){ return polling_list; }
    this.ajax_status = function() { return ajax_status; }
    this.ajax_calls = function() { return ajax_calls; }
    this.ajax_settimeouts = function() { return ajax_settimeouts; }
    init();

    /* 
        Private variables and methods
    */
    var MAX_NUM_RETRIES = 0;   // This is used to keep track of the number of successive failed ajax attempts.
    var MAX_NUM_RETRIES_LIMIT = 20;     // If MAX_NUM_RETRIES exceeds this, we stop all polling and display an error message
    var polling_list = fn_list;
    var ajax_timers = [];
    var ajax_settimeouts = {};
    var ajax_calls = {};
    var backoff_values = [0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];  // Leading zero is because trigger_delay starts at 0 and we do a +=. I don't want to start it at -1.
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
            if (typeof fn_name == 'object'){
                polling_list.push(jQuery.extend(true, {}, fn_name));
                start_polling(fn_name.fn_name);
            } else {    // fn_name is a string or an undefined
                fn_name = typeof fn_name !== 'undefined' ? fn_name: 'all'; // default value is 'all' if no fn_name given

                // set up timers for ajax updates 
                if (fn_name == 'all'){
                    // stop all timers first
                    if (!stop_polling()){
                        throw "stop_polling function failed!";
                    }
                    
                    for (var i = 0; i < polling_list.length; i++){
                        fn_preloader(polling_list[i]);
                    }
                } else {
                    // stop timer first
                    if (!stop_polling(fn_name)){
                        throw "stop_polling function failed!";
                    }

                    // locate the entry on ajax_function_timings
                    var timing_entry;
                    for (var i = 0; i < polling_list.length; i++){
                        if (polling_list[i].fn_name == fn_name){
                            timing_entry = i;
                            break;
                        }
                    }
                    if (typeof timing_entry == 'undefined'){
                        throw "function not found!";
                    }

                    fn_preloader(polling_list[timing_entry]);
                }

                return true;
            }
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
                if (typeof(ajax_status[fn_name]) != 'undefined') {
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
                alert_msg = 'It appears that there is either a problem reaching the server or a problem with the app. Please refresh the page again after a while. If the problem persists, please contact the developers';    
                $('#alert_wrapper').prepend(msg + alert_msg + msg_end);
                $('#'+rand_id).addClass('server-error');
            } 

            if (MAX_NUM_RETRIES >= MAX_NUM_RETRIES_LIMIT){ // stop all other polls and delete all other messages
                stop_polling(); // stop all ajax funtions
                $('.alert-error').filter(':not(".server-error")').remove();
            }
        } else {
            if (ajax_status[x.fn_name].error_details['status'] == 'timeout'){
                alert_msg = '<strong>'+x.fn_pretty_name+' timed out!</strong> Retrying in <span id="'+rand_id+'_countdown">'+ delay_str.substr(0, delay_str.length - 3) + '</span>s</br>';
            } else { // We got an error instead of a timeout
                alert_msg = '<strong>'+x.fn_pretty_name+' returned an error ('+ajax_status[x.fn_name].error_details['errorThrown']+')!</strong> Retrying in <span id="'+rand_id+'_countdown">'+ delay_str.substr(0, delay_str.length - 3) + '</span>s</br>';
            }
            $('#alert_wrapper').prepend(msg + alert_msg + msg_end);

            (function(){
                var countdown = parseInt(delay_str.substr(0, delay_str.length - 3));
                countdown.this_interval = setInterval(function(){   // assigning the setInterval to locally scoped countdown object
                    countdown--;
                    $('#'+rand_id+'_countdown').empty().append(countdown);
                    if (countdown <= 1){
                        clearInterval(countdown.this_interval);
                        $("#"+rand_id).fadeOut().remove();   // removes the alert box
                    };
                }, 1000);
            })();
        }
        $('.alert').alert();    // to enable the close functionality of the alert
    }

    // this function is used if you want to trigger the ajax function once but not make it poll
    // we need to duplicate the function entry on polling_list but set the delay to -1
    // this way, it can run side by side with the original polling function
    function exec_once(fn_name){
        var x, clone, timing_entry;
        
        if (typeof fn_name == 'object'){
            clone = jQuery.extend(true, {}, fn_name);   // deep copy method by john resig
            if ((!clone.url) || (!clone.dataType) || (!clone.timeout) || (!clone.success)){         // necessary variables
                throw "Missing variables."
            }

            if (!clone.fn_name){
                clone.fn_name = "anon_ajax_fn_" + Math.floor((Math.random() * 100000) + 1);
                clone.fn_pretty_name = "Anonymous Ajax Function";
            }

            // make it run only once
            clone.interval = -1;

        } else {    // preloaded function on polling_list
            // locate the entry on ajax_function_timings
            for (var i = 0; i < polling_list.length; i++){
                if (polling_list[i].fn_name == fn_name){
                    timing_entry = i;
                    break;
                }
            }
            if (typeof timing_entry == 'undefined'){
                throw "function not found!";
            }

            // duplicate function, set interval to -1, change function name to '...'+'_runonce'
            clone = jQuery.extend(true, {}, polling_list[timing_entry]); // deep copy method by john resig
            clone.interval = -1;
            clone.fn_name += '_runonce';

        }

        // do the actual execution
        fn_preloader(clone);

    }

    // do ajax call function
    // TODO: clean up this function. It's a mess!
    function exec_ajax(x){
        if (ajax_status[x.fn_name].status == 'WAITING'){
            ajax_calls[x.fn_name].abort();  // Cancel ongoing ajax call
            //ajax_status[x.fn_name].status = 'TIMEDOUT';
            ajax_status[x.fn_name].status = ajax_status[x.fn_name].error_details['status'] == 'timeout' ? 'TIMEDOUT':'ERROR';
            ajax_status[x.fn_name].trigger_delay += 1;
            MAX_NUM_RETRIES += 1;

            if ((ajax_status[x.fn_name].trigger_delay >= backoff_values.length) || (MAX_NUM_RETRIES >= MAX_NUM_RETRIES_LIMIT)){
                //console.log('It appears that there is either a problem reaching the server or a problem with the app. Please refresh the page again after a while.');
                timeout_inform(x, -1);
            } else {
                var delay = backoff_values[ajax_status[x.fn_name].trigger_delay];  // Because we need it in milliseconds 
                timeout_inform(x, delay);
                //console.log('Retrying in: ' + delay);
                // TODO: think of a better way to do this
                ajax_settimeouts[x.fn_name] = setTimeout(function(){exec_ajax(x);}, delay);
            }
            
        } else if ((ajax_status[x.fn_name].status == 'ERROR') || (ajax_status[x.fn_name].status == 'TIMEDOUT') || (ajax_status[x.fn_name].status == 'ACTIVE')) {
            ajax_status[x.fn_name].status = 'WAITING';
            ajax_status[x.fn_name].last_run = new Date();
            ajax_calls[x.fn_name] = $.ajax({
                    // required variables
                    url: typeof x.url == 'function' ? x.url():x.url, 
                    dataType: x.dataType, 
                    timeout: x.timeout, 
                    // non-required variables
                    beforeSend: typeof x.beforeSend == 'function' ? x.beforeSend:'', 
                    success: typeof x.success == 'function' ? x.success:'', 
                    error: typeof x.error == 'function' ? x.error:'',
                    type: typeof x.type != 'undefined' ? x.type:'GET',
                    data: typeof x.data != 'undefined' ? x.data:'',
                }).done(function(data){
                    MAX_NUM_RETRIES = 0;    // every time there is a successful ajax call, we reset this var to 0
                    ajax_status[x.fn_name].status = 'ACTIVE';
                    ajax_status[x.fn_name].trigger_delay = 0;
                    ajax_status[x.fn_name].error_details = {};
                    clearTimeout(ajax_settimeouts[x.fn_name]);
                    if (x.interval != -1){  // polling function, set up timer for next poll iteration
                        ajax_settimeouts[x.fn_name] = setTimeout(function(){exec_ajax(x);}, x.interval);
                    } else {   // exec_once function, set status to 'DONE'
                        ajax_status[x.fn_name].status = 'DONE';
                    }
                }).fail(function(jqXHR, status, errorThrown){
                    ajax_status[x.fn_name].error_details = {};
                    ajax_status[x.fn_name].error_details['status'] = status;
                    ajax_status[x.fn_name].error_details['errorThrown'] = errorThrown;
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
