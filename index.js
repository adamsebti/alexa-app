'use strict';

console.log('Loading function');

// var AWS = require("aws-sdk");
// AWS.config.update({
//   region: "us-east-1",
//   endpoint: "https://yatkyy4uwc.execute-api.us-east-1.amazonaws.com/prod/RecipeUpdate"
// });
// TODO: update time last accessed
var snoowrap = require('snoowrap');

var request = require('request');

const uuidV1 = require('uuid/v1');

const r = new snoowrap({
    userAgent: "Node automatic alexa scraper v2.0 (by /u/youni0)",
    clientId: 'SE6f4zPBnyFINA',
    clientSecret: 'SQqXsxoEw0Zoivg0eqv7Ctv1_T0',
    username: 'youni0',
    password: 'alexascript'
});

const doc = require('dynamodb-doc');

const dynamo = new doc.DynamoDB();

var table = "ChainReactions";



global.buildSpeechletResponse = (outputText, shouldEndSession) => {
    return {
        outputSpeech: {
            type: "PlainText",
            text: outputText
        },
        shouldEndSession: shouldEndSession
    }
}

global.generateResponse = (speechletResponse, sessionAttributes) => {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    }
}

// Checks if a post is an image or video or gif
function isMultimedia(post) {
    if (!post.hasOwnProperty('post_hint')) {
        return false;
    } else if (post['post_hint'] === 'image' || post['post_hint'] === 'rich:video') {
        return true;
    } else if (post['post_hint'] === 'link') {
        // check extension of url for photo/video/gif extension
        var extensions = ['jpg', 'jpeg', 'png', 'gifv', 'gif'];
        if (extensions.indexOf(post['url'].split(".").slice(-1)[0].toLowerCase()) > -1) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

// true if is image, false if video
function isImage(post) {
    if (post['post_hint'] === 'image') {
        return true;
    } else if (post['post_hint'] === 'link') {
        // check extension of url for photo/video/gif extension
        var extensions = ['jpg', 'jpeg', 'png', 'gifv', 'gif'];
        if (extensions.indexOf(post['url'].split(".").slice(-1)[0].toLowerCase()) > -1) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

// Keep posts after first api call to not have to do it each time
var savedPosts = [];
// Index of current post to be read.
var postIndex = 0;
// Number of posts allowed.
var numPosts = 50;

/**
 * Demonstrates a simple HTTP endpoint using API Gateway. You have full
 * access to the request and response payload, including headers and
 * status code.
 *
 * To scan a DynamoDB table, make a GET request with the TableName as a
 * query string parameter. To put, update, or delete an item, make a POST,
 * PUT, or DELETE request respectively, passing in the payload to the
 * DynamoDB API as a JSON body.
 */
exports.handler = (event, context, callback) => {

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Access-Control-Allow-Headers': 'x-requested-with',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
            'Content-Type': 'application/json',
        },
    });

    console.log('start function');

    if (event.httpMethod !== null && ['DELETE', 'GET', 'POST', 'PUT'].indexOf(event.httpMethod) >= 0) {
        switch (event.httpMethod) {
            case 'DELETE':
                dynamo.deleteItem(JSON.parse(event.body), done);
                break;
            case 'GET':
                dynamo.scan({
                    TableName: event.queryStringParameters.TableName
                }, done);
                break;
            case 'POST':
                dynamo.putItem(JSON.parse(event.body), done);
                break;
            case 'PUT':
                dynamo.updateItem(JSON.parse(event.body), done);
                break;
            default:
                done(new Error('Unsupported method "${event.httpMethod}"'));
        }
    } else { // Based on Jordan Leigh's Guide (https://github.com/AlwaysBCoding/Episodes/tree/master/amazon-echo)
        // Stages:
        // service (select a service),
        // reddit (getting updates from reddit)
        console.log("alexa command");
        console.log(event);
        switch (event.request.type) {
            case "LaunchRequest":
                // Denies user access right away if it has not been enough time since last request.
                // This also prevents user just changing the setting before enough time has passed.

                // User is only able to access once per frequency period, even if the usr didn't ask for all the posts he was allowed
                // in that access. e.g., Allowed 3 posts, accesses and asks for 1 post, exits, then reopens in same frequency period does not allow it
                var currDate = new Date();
                var params = {
                    TableName: table
                };
                dynamo.scan(params, function(err, data) {
                    if (err) {
                        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                    } else {
                        var userinfo = data.Items[0];
                        for (var i = 0; i < data.Items.length; i += 1) {
                            if (data.Items[i]['post_id'] === '0') {
                                userinfo = data.Items[i];
                            }
                        }
                        // Last date accessed
                        var oldDate = new Date(userinfo['year1'], userinfo['month1'], userinfo['day1'], userinfo['hour1'], userinfo['minute1'], userinfo['second1']);
                        // Gets difference in date in ms, then converts it to minutes
                        var diff = Math.floor((currDate - oldDate) / (1000 * 60));
                        var freq = userinfo['freq'];
                        if (diff >= freq) {
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Chain Reactions, what service would you like an update from?", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        } else {
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Get back to work for another " + (freq - diff).toString() + " minutes.", true), {}
                                )
                            );
                        }
                    }
                });
                break;
            case "IntentRequest":
                console.log("intent request")
                switch (event.request.intent.name) {
                    case "Service":
                        // no stage was selected because the user bypassed launch dialogue (e.g., ask chain reactions for reddit)
                        if (!event.session.attributes.hasOwnProperty('stage')) {
                            // User is only able to access once per frequency period, even if the usr didn't ask for all the posts he was allowed
                            // in that access. e.g., Allowed 3 posts, accesses and asks for 1 post, exits, then reopens in same frequency period does not allow it
                            var currDate = new Date();
                            var params = {
                                TableName: table
                            };
                            dynamo.scan(params, function(err, data) {
                                if (err) {
                                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                } else {
                                    var userinfo = data.Items[0];
                                    for (var i = 0; i < data.Items.length; i += 1) {
                                        if (data.Items[i]['post_id'] == '0') {
                                            userinfo = data.Items[i];
                                        }
                                    }
                                    // Last date accessed
                                    var oldDate = new Date(userinfo['year1'], userinfo['month1'], userinfo['day1'], userinfo['hour1'], userinfo['minute1'], userinfo['second1']);
                                    // Gets difference in date in ms, then converts it to minutes
                                    var diff = Math.floor((currDate - oldDate) / (1000 * 60));
                                    var freq = userinfo['freq'];
                                    if (diff >= freq) {
                                        if (event.request.intent.slots['ServiceName'].value.toLowerCase() === 'reddit') {
                                            context.succeed(
                                                global.generateResponse(
                                                    global.buildSpeechletResponse("Reddit! say update when you are ready. you can say repeat to hear a post again or more for post content or top comment", false), {
                                                        'stage': 'reddit'
                                                    }
                                                )
                                            );
                                        } else {
                                            context.succeed(
                                                global.generateResponse(
                                                    global.buildSpeechletResponse("My T Shape only allows me to update you on Reddit. Please say Reddit", false), {
                                                        'stage': 'service'
                                                    }
                                                )
                                            );
                                        }
                                    } else {
                                        context.succeed(
                                            global.generateResponse(
                                                global.buildSpeechletResponse("Get back to work for another " + (freq - diff).toString() + " minutes.", true), {}
                                            )
                                        );
                                    }
                                }
                            });
                        } else if (event.session.attributes['stage'] === 'service') {
                            console.log("stage service");
                            if (event.request.intent.slots['ServiceName'].value.toLowerCase() === 'reddit') {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("Reddit! say update when you are ready. you can say repeat to hear a post again or more for post content or top comment", false), {
                                            'stage': 'reddit'
                                        }
                                    )
                                );
                            } else {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("My T Shape only allows me to update you on Reddit. Please say Reddit", false), {
                                            'stage': 'service'
                                        }
                                    )
                                );
                            }
                        }
                        // user was in another stage and wants to change service
                        else {
                            console.log("not in stage service");
                            if (event.request.intent.slots['ServiceName'].value.toLowerCase() === 'reddit') {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("Reddit is selected. Ask for an update.", false), {
                                            'stage': 'reddit'
                                        }
                                    )
                                );
                            } else {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("My T Shape only allows me to update you on Reddit.", false), {
                                            'stage': event.session.attributes['stage']
                                        }
                                    )
                                );
                            }
                        }
                        break;
                    case "Update":
                        console.log("update");
                        // user bypassed launch dialogue so no stage was selected
                        if (!event.session.attributes.hasOwnProperty('stage')) {
                            // User is only able to access once per frequency period, even if the usr didn't ask for all the posts he was allowed
                            // in that access. e.g., Allowed 3 posts, accesses and asks for 1 post, exits, then reopens in same frequency period does not allow it
                            var currDate = new Date();
                            var params = {
                                TableName: table
                            };
                            dynamo.scan(params, function(err, data) {
                                if (err) {
                                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                } else {
                                    var userinfo = data.Items[0];
                                    for (var i = 0; i < data.Items.length; i += 1) {
                                        if (data.Items[i]['post_id'] == '0') {
                                            userinfo = data.Items[i];
                                        }
                                    }
                                    // Last date accessed
                                    var oldDate = new Date(userinfo['year1'], userinfo['month1'], userinfo['day1'], userinfo['hour1'], userinfo['minute1'], userinfo['second1']);
                                    // Gets difference in date in ms, then converts it to minutes
                                    var diff = Math.floor((currDate - oldDate) / (1000 * 60));
                                    var freq = userinfo['freq'];
                                    if (diff >= freq) {
                                        context.succeed(
                                            global.generateResponse(
                                                global.buildSpeechletResponse("Choose a service first.", false), {
                                                    'stage': 'service'
                                                }
                                            )
                                        );
                                    } else {
                                        context.succeed(
                                            global.generateResponse(
                                                global.buildSpeechletResponse("Get back to work for another " + (freq - diff).toString() + " minutes.", true), {}
                                            )
                                        );
                                    }
                                }
                            });
                        }
                        // user wants reddit update
                        else if (event.session.attributes['stage'] === 'reddit') {
                            // Get last media post from db
                            var userParams = {
                                TableName: table
                            };
                            dynamo.scan(userParams, function(err, data) {
                                if (err) {
                                    console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                } else {
                                    var userinfo = data.Items[0];
                                    for (var i = 0; i < data.Items.length; i += 1) {
                                        if (data.Items[i]['post_id'] == '0') {
                                            userinfo = data.Items[i];
                                        }
                                    }
                                    // Remove last media post from db if it exists
                                    var deleteParams = {
                                        TableName: table,
                                        Key: {
                                            "post_id": userinfo['last_post_id']
                                        }
                                    }
                                    dynamo.deleteItem(deleteParams, function(err, data) {
                                        if (err) {
                                            console.error("Unable to remove link. Error JSON:", JSON.stringify(err, null, 2));
                                        } else {
                                            console.log("deleted item if it existed");
                                            // go on with usual business
                                            if (postIndex >= numPosts) {
                                                context.succeed(
                                                    global.generateResponse(
                                                        global.buildSpeechletResponse("You've used all your updates. Get back to work.", true), {}
                                                    )
                                                );
                                            }
                                            // If we've previously called API to get posts
                                            else if (savedPosts.toString()) {
                                                // copy array
                                                // var post = savedPosts.slice();
                                                // var curr = post[0];
                                                // savedPosts = savedPosts.slice(1);
                                                var curr = savedPosts[postIndex];
                                                postIndex += 1;
                                                // text post
                                                if (curr['selftext_html']) {
                                                    console.log("saved text post");
                                                    context.succeed(
                                                        global.generateResponse(
                                                            global.buildSpeechletResponse("Post in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                                'stage': 'reddit'
                                                            }
                                                        )
                                                    );
                                                } else if (isMultimedia(curr)) {
                                                    console.log("saved multimedia post");
                                                    //TODO: add parameter to db for video or image so that GUI can display them correctly
                                                    var is_image = isImage(curr);
                                                    // Put in database
                                                    var uniqueId = uuidV1();
                                                    var params = {
                                                        TableName: table,
                                                        Item: {
                                                            "link": curr['url'],
                                                            "post_id": uniqueId,
                                                            "is_image": is_image
                                                        }
                                                    }
                                                    dynamo.putItem(params, function(err, data) {
                                                        if (err) {
                                                            console.error("Unable to add link ", curr['link'], ". Error JSON:", JSON.stringify(err, null, 2));
                                                        } else {
                                                            console.log("PutItem succeeded:");
                                                            // Storing id of the post that was just added so it can be removed next time
                                                            var updateParams = {
                                                                TableName: table,
                                                                Key: {
                                                                    "post_id": '0'
                                                                },
                                                                UpdateExpression: "set last_post_id = :p",
                                                                ExpressionAttributeValues: {
                                                                    ":p": uniqueId
                                                                }
                                                            }
                                                            dynamo.updateItem(updateParams, function(err, data) {
                                                                if (err) {
                                                                    console.error("Unable to update link ref", curr['link'], ". Error JSON:", JSON.stringify(err, null, 2));
                                                                } else {
                                                                    console.log("UpdateItem succeeded:");
                                                                    context.succeed(
                                                                        global.generateResponse(
                                                                            global.buildSpeechletResponse("Media in " + curr['subreddit']['display_name'] + ": " + curr['title'] + ". Look at the GUI for content.", false), {
                                                                                'stage': 'reddit'
                                                                            }
                                                                        )
                                                                    );
                                                                }
                                                            });

                                                        }
                                                    });

                                                } else {
                                                    console.log("saved link post");

                                                    // Summarize the link
                                                    context.succeed(
                                                        global.generateResponse(
                                                            global.buildSpeechletResponse("Article in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                                'stage': 'reddit'
                                                            }
                                                        )
                                                    );
                                                }
                                            } else {
                                                // TODO: limit this to number of posts allowed to save space
                                                // TODO: update last access date in db
                                                // get hot posts from reddit can include subreddit as a parameter
                                                r.getHot().then(function(post) {
                                                    // postIndex should be 0
                                                    var curr = post[postIndex];
                                                    postIndex += 1;
                                                    // savedPosts = post.slice(1);
                                                    savedPosts = post.slice();
                                                    // text post
                                                    if (curr['selftext_html']) {
                                                        console.log("text post");
                                                        context.succeed(
                                                            global.generateResponse(
                                                                global.buildSpeechletResponse("Post in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                                    'stage': 'reddit'
                                                                }
                                                            )
                                                        );
                                                    } else if (isMultimedia(curr)) {
                                                        console.log("multimedia post");
                                                        //TODO: add parameter to db for video or image so that GUI can display them correctly
                                                        var is_image = isImage(curr);
                                                        // Put in database
                                                        var uniqueId = uuidV1();
                                                        var params = {
                                                            TableName: table,
                                                            Item: {
                                                                "link": curr['url'],
                                                                "post_id": uniqueId,
                                                                "is_image": is_image
                                                            }
                                                        }
                                                        dynamo.putItem(params, function(err, data) {
                                                            if (err) {
                                                                console.error("Unable to add link ", curr['link'], ". Error JSON:", JSON.stringify(err, null, 2));
                                                            } else {
                                                                console.log("PutItem succeeded:");
                                                                // Storing id of the post that was just added so it can be removed next time
                                                                // also update last time accessed
                                                                var updateDate = new Date();
                                                                var updateParams = {
                                                                    TableName: table,
                                                                    Key: {
                                                                        "post_id": '0'
                                                                    },
                                                                    UpdateExpression: "set last_post_id = :p, year1 = :y, month1 = :m, day1 = :d, hour1 = :h, minute1 = :mi, second1 = :s",
                                                                    ExpressionAttributeValues: {
                                                                        ":p": uniqueId,
                                                                        ":y": updateDate.getFullYear(),
                                                                        ":m": updateDate.getMonth(),
                                                                        ":d": updateDate.getDate(),
                                                                        ":h": updateDate.getHours(),
                                                                        ":mi": updateDate.getMinutes(),
                                                                        ":s": updateDate.getSeconds()
                                                                    }
                                                                }
                                                                dynamo.updateItem(updateParams, function(err, data) {
                                                                    if (err) {
                                                                        console.error("Unable to update link ref", curr['link'], ". Error JSON:", JSON.stringify(err, null, 2));
                                                                    } else {
                                                                        console.log("UpdateItem succeeded:");
                                                                        context.succeed(
                                                                            global.generateResponse(
                                                                                global.buildSpeechletResponse("Media in " + curr['subreddit']['display_name'] + ": " + curr['title'] + ". Look at the GUI for content.", false), {
                                                                                    'stage': 'reddit'
                                                                                }
                                                                            )
                                                                        );
                                                                    }
                                                                });

                                                            }
                                                        });
                                                    } else {
                                                        console.log("link post");

                                                        // Summarize the link
                                                        context.succeed(
                                                            global.generateResponse(
                                                                global.buildSpeechletResponse("Article in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                                    'stage': 'reddit'
                                                                }
                                                            )
                                                        );
                                                    }
                                                });
                                                // console.log(curr);
                                            };
                                            // end usual business
                                        }
                                    })
                                }
                            });




                        } else {
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Choose a service first.", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        }
                        break;
                    case "More":
                        if (!event.session.attributes.hasOwnProperty('stage') || event.session.attributes['stage'] === 'service') {
                            // TODO: make time check here too since we do time checks only when there is no stage attribute
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Say a service like reddit.", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        } else if (event.session.attributes['stage'] === 'reddit') {
                            if (postIndex === 0) {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("First say update to get a post.", false), {
                                            'stage': 'reddit'
                                        }
                                    )
                                );
                            }
                            // postIndex > 0
                            else {
                                // get last post said
                                var curr = savedPosts[postIndex - 1];
                                if (curr['selftext_html']) {
                                    console.log("text post");
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Body: " + curr['selftext'], false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    );
                                } else if (isMultimedia(curr)) {
                                    console.log("is multimedia");
                                    // Put in database
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Title: " + curr['title'] + ". Look at the GUI for content.", false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    );
                                } else {
                                    console.log("is link");
                                    // Summarize the link
                                    request.get({
                                        url: 'http://api.smmry.com/SM_API_KEY=C2E29B2BF2&SM_LENGTH=2&SM_URL=' + curr['url'],
                                        json: true,
                                        headers: {
                                            'User-Agent': 'request'
                                        }
                                    }, (err, res, data) => {
                                        if (err) {
                                            console.log('Error:', err);
                                        } else if (res.statusCode !== 200) {
                                            console.log('Status:', res.statusCode);
                                        } else {
                                            context.succeed(
                                                global.generateResponse(
                                                    global.buildSpeechletResponse("Summary: " + data['sm_api_content'], false), {
                                                        'stage': 'reddit'
                                                    }
                                                )
                                            );
                                        }
                                    })
                                }
                            }
                        }
                        break;
                    case "Repeat":
                        if (!event.session.attributes.hasOwnProperty('stage') || event.session.attributes['stage'] === 'service') {
                            // TODO: make time check here too since we do time checks only when there is no stage attribute
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Say a service like reddit.", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        } else if (event.session.attributes['stage'] === 'reddit') {
                            if (postIndex === 0) {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("First say update to get a post.", false), {
                                            'stage': 'reddit'
                                        }
                                    )
                                );
                            }
                            // postIndex > 0
                            else {
                                // get last post said
                                var curr = savedPosts[postIndex - 1];
                                if (curr['selftext_html']) {
                                    console.log("text post");
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Post in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    );
                                } else if (isMultimedia(curr)) {
                                    console.log("is multimedia");
                                    // Put in database
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Media in " + curr['subreddit']['display_name'] + ": " + curr['title'] + ". Look at the GUI for content.", false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    );
                                } else {
                                    console.log("is link");
                                    // Summarize the link
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Article in " + curr['subreddit']['display_name'] + ": " + curr['title'], false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    );
                                }
                            }
                        }
                        break;
                    case "TopComment":
                        if (!event.session.attributes.hasOwnProperty('stage') || event.session.attributes['stage'] === 'service') {
                            // TODO: make time check here too since we do time checks only when there is no stage attribute
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("Say a service like reddit.", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        } else if (event.session.attributes['stage'] === 'reddit') {
                            if (postIndex === 0) {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse("First say update to get a post.", false), {
                                            'stage': 'reddit'
                                        }
                                    )
                                );
                            }
                            // postIndex > 0
                            else {
                                // get last post said
                                var curr = savedPosts[postIndex - 1];
                                curr.expandReplies({
                                    limit: 1,
                                    depth: 1
                                }).then(function(comment) {
                                    console.log(comment['comments'][0].body);
                                    context.succeed(
                                        global.generateResponse(
                                            global.buildSpeechletResponse("Top comment: " + comment['comments'][0].body, false), {
                                                'stage': 'reddit'
                                            }
                                        )
                                    )
                                });
                            }
                        }
                        break;
                    case "WhatCanISay":
                        // user bypassed launch dialogue and wants help
                        if (!event.session.attributes.hasOwnProperty('stage')) {
                            // TODO: make time check here too since we do time checks only when there is no stage attribute
                            context.succeed(
                                global.generateResponse(
                                    global.buildSpeechletResponse("You can say the name of a service like Reddit or say back to work", false), {
                                        'stage': 'service'
                                    }
                                )
                            );
                        } else {
                            var stage = event.session.attributes['stage'];
                            if (stage === 'service') {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse('You can say the name of a service like Reddit or say back to work', false), {
                                            'stage': event.session.attributes['stage']
                                        }
                                    )
                                )
                            } else if (stage === 'reddit') {
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse('You can say update for a new post or repeat to hear the last post again or more for post content or back to work', false), {
                                            'stage': event.session.attributes['stage']
                                        }
                                    )
                                )
                            } else {
                                // ???
                                context.succeed(
                                    global.generateResponse(
                                        global.buildSpeechletResponse('You can say the name of a service or exit', false), {
                                            'stage': event.session.attributes['stage']
                                        }
                                    )
                                )
                            }
                        }
                        break;
                    case "Exit":
                        // reset savePosts in case Alexa saves them sometimes between executions
                        savedPosts = [];
                        context.succeed(
                            global.generateResponse(
                                global.buildSpeechletResponse('Back to work', true), {}
                            )
                        )
                        break;
                    case "Unhandled":
                        context.succeed(
                            global.generateResponse(
                                global.buildSpeechletResponse('I did not get that. Say help or repeat yourself.', false), {
                                    'stage': event.session.attributes['stage']
                                }
                            )
                        )
                        break;
                    default:
                        throw "Invalid intent"
                }
                break;
            case "SessionEndedRequest":
                break;
            default:
                context.fail('INVALID REQUEST TYPE: ${event.request.type}')

        }
    }

};
