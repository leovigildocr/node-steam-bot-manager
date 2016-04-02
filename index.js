/**
 * Documentation and comments will be done later...
 */

var inquirer = require("inquirer");// Used for prompts (GUI)
require('request');// Used for sending requests to the jackpot website.
require('colors');// Used to prettify messages send by the console

var BotAccount = require('./classes/BotAccount.js');
var DataControl = require('./components/DataControl.js');
var APIControl = require('./components/API_Control.js');


// Import events module
BotManager.prototype.dataControl = new DataControl("config");
BotManager.prototype.APIControl = null;
BotManager.prototype.__proto__ = require('events').EventEmitter.prototype;


BotManager.prototype.BotAccounts = [];


function BotManager() {
    var self = this;

}

BotManager.prototype.startManager = function () {
    var self = this;
    self.dataControl.on('error', function (err) {
        self.errorDebug(err);
    });

    self.dataControl.on('loadedConfig', function (configResponse) {
        config = configResponse;
        if (self.dataControl.getConfig().hasOwnProperty("api_port")) {
            self.APIControl = new APIControl(self.dataControl.getConfig());
            self.APIControl.on('apiLoaded', function () {
                self.emit('loadedAPI');
            });
            self.APIControl.startAPI();
        }
    });


    self.dataControl.on('debug', function (msg) {
        self.infoDebug(msg);
    });


    self.dataControl.on('loadedAccount', function (accountInfo) {
        var activeAccount = new BotAccount(accountInfo);
        if (activeAccount.getAccount().shared_secret) {
            activeAccount.loginAccount();
        }
        activeAccount.on('displayBotMenu', function () {
            self.displayBotMenu();
        });
        activeAccount.on('sentOfferChanged', function (offer, oldState) {
            self.emit('sentOfferChanged', offer, oldState);
        });


        activeAccount.on('newOffer', function (offer) {
            self.emit('newOffer', activeAccount, offer);
        });
        activeAccount.on('loggedIn', function (activeAccount) {
            // User just logged in
            if (activeAccount.getDisplayName() != null) {
                activeAccount.changeName(activeAccount.getDisplayName(), config.bot_prefix, function (err) {
                    if (err) {
                        self.errorDebug("Failed to change name. Error: " + err);
                    }
                })
            }
            self.emit('loggedIn', activeAccount);
        });


        activeAccount.on('updatedAccountDetails', function () {
            self.saveAccounts(function (err) {
                if (err)
                    self.errorDebug(err);
            });
        });

        activeAccount.on('incorrectCredentials', function (accountDetails) {
            // We must ask user for new details...
            self.errorDebug("The following details are incorrect: \nusername: {0}\npassword: {1}".format(accountDetails.accountName, accountDetails.password));
        });


        self.BotAccounts.push(activeAccount);
    });


    self.dataControl.initData(function (err, botAccountsList) {
        if (err)
            self.errorDebug(err);
        else {
            // Finished loading...
            self.displayBotMenu();
        }
    });
};

BotManager.prototype.apiEndpoint = function (method, url, callback) {
    var self = this;
    self.APIControl.apiEndpoint(method, url, callback);
};
BotManager.prototype.restartAPI = function () {
    var self = this;
    self.APIControl.restartAPI();
};


BotManager.prototype.displayBotMenu = function () {
    var self = this;
    var tempList = [];
    for (var accountIndex in self.getAccounts()) {
        if (self.getAccounts().hasOwnProperty(accountIndex)) {
            tempList.push(self.getAccounts()[accountIndex].getAccountName());
        }
    }
    tempList.push(new inquirer.Separator());
    tempList.push("register");
    tempList.push("exit");

    var botList = [
        {
            type: 'list',
            name: 'accountName',
            message: 'Choose the bot you would like to operate:',
            choices: tempList
        }
    ];
    inquirer.prompt(botList, function (result) {
        switch (result.accountName) {

            case 'register':

                var questions = [
                    {
                        type: 'input',
                        name: 'accountName',
                        message: 'What\'s the bot username?'
                    },
                    {
                        type: 'password',
                        name: 'password',
                        message: 'What\'s the bot password?'
                    }
                ];

                inquirer.prompt(questions, function (result) {
                    self.dataControl.registerAccount({accountName: result.accountName, password: result.password});
                    self.displayBotMenu();
                });

                break;
            case 'exit':
                process.exit();
                break;
            default:
                self.botLookup(result.accountName, function (err, accountDetails) {
                    // Check if bot is online or offline
                    if (err) {
                        self.errorDebug(err);
                    }
                    else {
                        self.displayMenu(accountDetails);
                    }
                });
                break;
        }


    });
};

BotManager.prototype.botLookup = function (keyData, callback) {
    var self = this;
    try {
        if (self.getAccounts()[parseInt(keyData)])
            callback(null, self.getAccounts()[parseInt(keyData)]);
        else
            for (var botAccountIndex in self.getAccounts()) {
                if (self.getAccounts().hasOwnProperty(botAccountIndex)) {
                    if (self.getAccounts()[botAccountIndex].getAccountName().toLowerCase() == keyData.toLowerCase()) {
                        callback(null, self.getAccounts()[botAccountIndex]);
                    }
                }
            }
    } catch (e) {
        callback({msg: "Failed to find bot with name or id."}, null);
    }
};

BotManager.prototype.processChat = function (activeAccount, target) {
    var self = this;
    var chatMessage = [
        {
            message: 'Enter your message (\'quit\' to leave): ',
            type: 'input',
            name: 'message'
        }
    ];
    inquirer.prompt(chatMessage, function (result) {
        if (result.message.toLowerCase() == "quit" || result.message.toLowerCase() == "exit") {
            activeAccount.setChatting(null);
            self.displayMenu(activeAccount);
        }
        else {
            activeAccount.sendMessage(target, result.message);
            self.processChat(activeAccount, target);
        }
    });
};

BotManager.prototype.displayMenu = function (activeAccount) {
    var self = this;
    activeAccount.community.loggedIn(function (err, loggedIn, familyView) {
        var menuOptions = [
            "Chat",
            "Send trade",
            //"Calculate Inventory", This option was temporary, but may maybe added later.
            new inquirer.Separator(),
            loggedIn ? "Logout" : "Login",
            new inquirer.Separator(),
            "Manage",
            "Delete",
            "Back"
        ];
        var mainMenu = [
            {
                type: 'list',
                name: 'menuOption',
                message: 'What would you like to do:',
                choices: menuOptions
            }
        ];
        inquirer.prompt(mainMenu, function (result) {
            var menuEntry = menuOptions.indexOf(result.menuOption);
            switch (menuEntry) {
                case 0:
                    activeAccount.getFriends(function (err, friendsList) {
                        friendsList.unshift({accountName: "Back"});
                        var nameList = [];
                        for (var friendId in friendsList) {
                            nameList.push(friendsList[friendId].accountName);
                        }

                        var chatMenu = [
                            {
                                type: 'list',
                                name: 'chatOption',
                                message: 'Who would you like to chat with? (only active chats visible)',
                                choices: nameList
                            }
                        ];
                        inquirer.prompt(chatMenu, function (result) {
                            var menuEntry = nameList.indexOf(result.chatOption);
                            // We will open chat with...
                            switch (menuEntry) {
                                case 0:
                                    self.displayMenu(activeAccount);
                                    break;
                                default:
                                    // User wants to actually chat with someone...
                                    activeAccount.setChatting({
                                        accountName: friendsList[menuEntry].accountName,
                                        sid: friendsList[menuEntry].accountSid
                                    });
                                    self.processChat(activeAccount, friendsList[menuEntry].accountSid);
                                    break;
                            }
                        });
                    });


                    break;
                case 1:
                    activeAccount.getFriends(function (err, friendsList) {
                        friendsList.unshift({accountName: "Other SID/Name"});// Add to second pos
                        friendsList.unshift({accountName: "Back"});// Add to first pos
                        var nameList = [];
                        for (var friendId in friendsList) {
                            nameList.push(friendsList[friendId].accountName);
                        }

                        var tradeMenu = [
                            {
                                type: 'list',
                                name: 'tradeOption',
                                message: 'Who would you like to trade with?',
                                choices: nameList
                            }
                        ];
                        inquirer.prompt(tradeMenu, function (result) {
                            var menuEntry = nameList.indexOf(result.tradeOption);
                            // We will open chat with...
                            switch (menuEntry) {
                                case 0:
                                    // Go back
                                    self.displayMenu(activeAccount);
                                    break;
                                case 1:
                                    // Trade with custom steam id.
                                    // TODO: add trade to steam id
                                    self.displayMenu(activeAccount);
                                    break;
                                default:
                                    // Trade with user selected.
                                    var currentOffer = activeAccount.createOffer(friendsList[menuEntry].accountSid);
                                    activeAccount.getInventory(730, 2, true, function (err, inventory, currencies) {
                                        var nameList = [];
                                        for (var id in inventory) {
                                            nameList.push(inventory[id].name);
                                            if (id > 30)
                                                break;
                                        }


                                        var tradeMenu = [
                                            {
                                                type: 'list',
                                                name: 'tradeOption',
                                                message: 'What would you like to offer?',
                                                choices: nameList
                                            }
                                        ];
                                        inquirer.prompt(tradeMenu, function (result) {
                                            var menuEntry = nameList.indexOf(result.tradeOption);
                                            var added = currentOffer.addMyItem(inventory[menuEntry]);
                                            currentOffer.send("Manual offer triggered by Bot Manager.", null, function (err, status) {
                                                console.log(err);// if 50, then too many trades to this user currently...
                                                console.log(status);
                                                var time = activeAccount.getUnixTime();
                                                activeAccount.getConfirmations(time, activeAccount.generateMobileConfirmationCode(time, "conf"), function (err, confirmations) {
                                                    console.log("Trying to confirm...");


                                                    if (err) {
                                                        console.log(err);
                                                    }
                                                    else {
                                                        for (var confirmId in confirmations) {
                                                            console.log("Confirming trade with title: " + confirmations[confirmId].title);
                                                            confirmations[confirmId].respond(time, activeAccount.generateMobileConfirmationCode(time, "allow"), true, function (err) {
                                                                if (err) {
                                                                    console.log("Trade failed to confirm");
                                                                }
                                                                else {
                                                                    console.log("Confirmed trade.");

                                                                }
                                                            });
                                                        }
                                                    }
                                                });
                                            });
                                            console.log(added);
                                        });
                                    });
                                    break;
                            }
                        });
                    });
                    break;
                //case 2:
                //// TODO calculate inventory
                ////appid, contextid, tradeableOnly, callback
                //self.infoDebug("Loading inventory...");
                //activeAccount.getInventory(730, 2, true, function (err, inventory, currencies) {
                //    self.infoDebug("Loaded inventory...");
                //
                //    var itemNameList = [];
                //    for (var econItemIndex in inventory) {
                //        var econItem = inventory[econItemIndex];
                //        itemNameList.push(econItem.name);
                //    }
                //    request({
                //        url: config.marketInfo.marketAPIURL + '/api/v1/precise/batch/item',
                //        method: "POST",
                //        json: true,   // <--Very important!!!
                //        body: {itemNameList: JSON.stringify(itemNameList)}
                //    }, function (error, response, body) {
                //        var itemsInfo = {};
                //        itemsInfo.totalWorth = 0;
                //        for (var itemInfo in body) {
                //            if (body.hasOwnProperty(itemInfo)) {
                //                if (body[itemInfo].value != null) {
                //                    itemsInfo.totalWorth += parseFloat(body[itemInfo].value);
                //                }
                //            }
                //        }
                //        self.infoDebug("Worth of inventory is ${0}".format(itemsInfo.totalWorth / 100));
                //        self.displayMenu(activeAccount);
                //
                //    });
                //});
                //break;
                case 3:
                    // Handle logout/login logic and return to menu.
                    if (!loggedIn) {
                        self.successDebug("Trying to authenticate into {0}".format(activeAccount.getAccountName()));
                        activeAccount.loginAccount(null);
                        self.displayBotMenu();
                    } else {
                        activeAccount.logoutAccount();
                        self.displayBotMenu();
                    }
                    break;
                case 5:

                    var authOptions = [];
                    authOptions.push("Edit Display name");
                    authOptions.push(new inquirer.Separator());
                    authOptions.push((activeAccount.has_shared_secret() ? "[ON]" : "[OFF]") + " Two Factor Authentication");
                    authOptions.push("Generate 2-factor-authentication code");
                    authOptions.push("Back");

                    var authMenu = [
                        {
                            type: 'list',
                            name: 'authOption',
                            message: 'Choose the authentication option you would like to activate.',
                            choices: authOptions
                        }
                    ];
                    inquirer.prompt(authMenu, function (result) {
                        var optionIndex = authOptions.indexOf(result.authOption);
                        switch (optionIndex) {
                            case 0:
                                var questions = [
                                    {
                                        type: 'input',
                                        name: 'newName',
                                        message: "Enter the new name of the bot: "
                                    },
                                    {
                                        type: 'confirm',
                                        name: 'prefix',
                                        default: true,
                                        message: "Give default prefix of '{0}'?".format(config.bot_prefix)
                                    }
                                ];

                                inquirer.prompt(questions, function (result) {
                                    activeAccount.changeName(result.newName, config.bot_prefix, function (err) {
                                        if (err) {
                                            self.errorDebug("Failed to change name. Error: ", err);
                                        }
                                        else {
                                            self.infoDebug("Successfully changed display name");
                                        }
                                        self.displayMenu(activeAccount);
                                    })
                                });


                                break;
                            case 2:
                                if (!activeAccount.shared_secret) {
                                    // Enable 2FA
                                    self.enableTwoFactor(activeAccount);
                                } else {
                                    // TODO: Move to BotAccount class
                                    //disable2FA(activeAccount);

                                }
                                break;
                            case 3:
                                if (activeAccount.has_shared_secret()) {
                                    // Send the auth key.
                                    self.successDebug("Your authentication code for {0} is {1}".format(activeAccount.getAccountName(), activeAccount.generateMobileAuthenticationCode()));
                                } else {
                                    // Authn not enabled?
                                    self.errorDebug("2-factor-authentication is not enabled. Check your email.");
                                }
                                self.displayMenu(activeAccount);
                                break;
                            default:
                                self.displayMenu(activeAccount);
                                break;
                        }
                    });


                    break;
                case 6:
                    var questions = [
                        {
                            type: 'confirm',
                            name: 'askDelete',
                            message: 'Are you sure you want to delete \'' + activeAccount.accountName + '\' account?'
                        }
                    ];
                    inquirer.prompt(questions, function (answers) {
                        if (answers.askDelete) {
                            self.unregisterAccount(activeAccount, function (err) {
                                if (err) {
                                    // Failed...
                                    self.errorDebug(err);
                                }
                                else {
                                    self.displayBotMenu();
                                }
                            });
                        }
                        else {
                            self.displayMenu(activeAccount);
                        }
                    });

                    break;
                case 7:
                    self.displayBotMenu();
                    break;
            }

        });
    });
};

BotManager.prototype.enableTwoFactor = function (activeAccount) {
    var self = this;
    activeAccount.hasPhone(function (err, hasPhone, lastDigits) {
        if (hasPhone) {
            activeAccount.enableTwoFactor(function (response) {
                self.successDebug("Make sure to save the following code saved somewhere secure: {0}".format(response.revocation_code));
                var questions = [
                    {
                        type: 'input',
                        name: 'code',
                        message: "Enter the code texted to the phone number associated (-{0}) to the account: ".format(lastDigits)
                    }
                ];

                inquirer.prompt(questions, function (result) {
                    if (result.code) {
                        var steamCode = result.code;
                        activeAccount.finalizeTwoFactor(response.shared_secret, steamCode, function (err, keyInformation) {
                            if (err) {
                                self.errorDebug(err);
                                self.displayMenu(activeAccount);
                            }
                            else {
                                self.saveAccounts(function (err) {
                                    self.errorDebug(err);
                                });
                            }
                        });
                    }
                });
            });
        }
        else {
            var questions = [
                {
                    type: 'confirm',
                    name: 'confirmAddition',
                    message: "A phone number is required to activate 2-factor-authentication. Would you like to set your phone number?",
                    default: false
                }
            ];

            inquirer.prompt(questions, function (result) {
                if (result.confirmAddition) {

                    var questions = [
                        {
                            type: 'input',
                            name: 'phoneNumber',
                            message: "Enter the number you would like to link to the account ()",
                            validate: function (value) {
                                var pass = value.match(/\+(9[976]\d|8[987530]\d|6[987]\d|5[90]\d|42\d|3[875]\d|2[98654321]\d|9[8543210]|8[6421]|6[6543210]|5[87654321]|4[987654310]|3[9643210]|2[70]|7|1)\d{1,14}$/i);
                                if (pass) {
                                    return true;
                                }
                                return 'Please enter a valid phone number (ex. +18885550123)';
                            }
                        }
                    ];

                    inquirer.prompt(questions, function (result) {
                        activeAccount.addPhoneNumber(result.phoneNumber, function (err) {
                            if (err) {
                                self.errorDebug(err);
                                self.displayMenu(activeAccount);
                            }
                            else {
                                var questions = [
                                    {
                                        type: 'input',
                                        name: 'code',
                                        message: "Enter the code sent to your phone number at " + result.phoneNumber
                                    }
                                ];

                                inquirer.prompt(questions, function (result) {
                                    activeAccount.verifyPhoneNumber(result.code, function (err) {
                                        if (err) {
                                            self.errorDebug(err);
                                            self.displayMenu(activeAccount);
                                        }
                                        else {
                                            // Verified phone number...
                                            self.enableTwoFactor(activeAccount);
                                        }
                                    });
                                });
                            }
                        });
                    });
                }
                else {
                    // Take back to main menu.
                    self.errorDebug("Declined addition of phone number.");
                    self.displayMenu(activeAccount);
                }
            });
        }
    });
};

BotManager.prototype.unregisterAccount = function (accountDetails, callback) {
    var self = this;
    self.BotAccounts.splice(self.BotAccounts.indexOf(accountDetails), self.BotAccounts.indexOf(accountDetails) + 1);
    // Temporarily disable the save part as we want to make sure we unregister the AUTH before deleting.
    //self.saveAccounts(function(err){
    //    self.errorDebug(err);
    //});
};

BotManager.prototype.getAccounts = function () {
    var self = this;
    return self.BotAccounts;
};
BotManager.prototype.saveAccounts = function (callback) {
    var self = this;
    self.dataControl.saveAccounts(self.getAccounts(), function (err) {
        if (err) {
            callback(err);
        }
        callback(null);
    });
};


BotManager.prototype.infoDebug = function (message) {
    console.log((message + " ").grey);
};
BotManager.prototype.errorDebug = function (message) {
    console.log(message);
    console.log((message + " ").red);
};
BotManager.prototype.successDebug = function (message) {
    console.log((message + " ").green);
};

BotManager.prototype.chooseRandomBot = function () {
    var self = this;
    console.log(Math.floor(Math.round(Math.random() * self.getAccounts().length)));
    return self.getAccounts()[0];
};


/**
 * Apply format function for any string in the file (used to correctly format strings with variables).
 * @returns {String}
 */
String.prototype.format = function () {
    var content = this;
    for (var i = 0; i < arguments.length; i++) {
        var replacement = '{' + i + '}';
        content = content.replace(replacement, arguments[i]);
    }
    return content;
};

//new BotManager();

module.exports = BotManager;

