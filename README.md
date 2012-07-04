ajax-overseer
=============

Javascript object that helps to manage execution and polling of ajax functions.

To use it:
1) Modify your ajax calls to have the following format:
    var ajax_fn_2 = {
        'fn_name': 'ajax_fn_2',
        'pretty_fn_name': 'Ajax Function 2',
        'url': '/test_ajax_fn_1/',
        'dataType': 'json',
        'timeout': 8000,
        'interval': 8000,
        'beforeSend': function(){...},
        'success': function(data){...},
        'error': function(jqXHR, status, errorThrown){...},
    }

2) Create an overseer object:
var overseer = new ajax_overseer([
            ajax_fn_1,
            ajax_fn_2,
        ]);

3) Tell overseer to start polling:
overseer.start_polling();

------------------

You can also do:
overseer.stop_polling()
overseer.stop_polling(fn_name)
overseer.start_polling()   // exec and restart all the fns
overseer.start_polling(fn_name)   // exec and restart just this fn


-----------------

If any of the ajax calls gets an error or timeout, it will display a timeout message to the user, and execute the function again after a certain backoff time has elapsed. This backoff time exponentially grows.

------------------
