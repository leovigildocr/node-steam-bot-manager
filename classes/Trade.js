Trade.prototype.__proto__ = require('events').EventEmitter.prototype;

function Trade(trade, auth, settings, logger) {
    var self = this;
    if (typeof trade != "object" || typeof auth != "object")
        throw Error("TradeOfferManager & AuthHandler must be passed respectively.");
    self.auth = auth;
    self.trade = trade;
    self.api_access = false;
    self.logger = logger;
    if (typeof settings != "object")
        self.settings = {
            cancelTradeOnOverflow: true
        };
    else
        self.settings = settings;
}

Trade.prototype.setAPIAccess = function (api_access) {
    var self = this;
    self.api_access = api_access;
};
/**
 * Confirm (not accept) all outstanding trades that were sent out, regardless of trade target via the two-factor authenticator.
 */
Trade.prototype.confirmOutstandingTrades = function (callback) {
    var self = this;
    var time = self.auth.getTime();
    self.auth.getConfirmations(time, self.auth.generateMobileConfirmationCode(time, "conf"), function (err, confirmations) {
        if (err) {
            if (self.logger != undefined)
                self.logger.log('error', "Failed to confirm outstanding trades, retrying in 5 seconds");
            setTimeout(self.confirmOutstandingTrades(callback), 5000);
        }
        else {
            var confirmedTrades = [];
            if (confirmations.length > 0) {
                for (var confirmId in confirmations) {
                    if (confirmations.hasOwnProperty(confirmId)) {
                        confirmations[confirmId].respond(time, self.auth.generateMobileConfirmationCode(time, "allow"), true, function (err) {
                            confirmedTrades.push(confirmations[confirmId]);
                            if (confirmedTrades.length == confirmations.length) {
                                // Everything went smooth
                                return callback(undefined, confirmations);
                            }
                        });
                    }
                }
            } else {
                callback(undefined, []);
            }
        }
    });
};

/**
 * Create a trade offer with the recipient
 * @param steamid - SteamID id any form (SteamID2, SteamID3, SteamID64, or Tradeurl)
 * @param callback
 * @returns {*}
 */
Trade.prototype.createOffer = function (sid, callback) {
    var self = this;

    if (self.settings.cancelTradeOnOverflow && self.api_access) {
        if (self.logger != undefined)
            self.logger.log('debug', 'Checking for overflow in trades');
        self.trade.getOffers(1, undefined, function (err, sent, received) {
            if (err)
                return callback(err, undefined);

            var allTrades = [];
            var tradeToCancelDueToTotalLimit = undefined;
            var tradeToCancelDueToPersonalLimit = [];

            for (var tradeIndex in sent) {
                allTrades.push(sent[tradeIndex]);
            }
            for (var tradeIndex in received) {
                allTrades.push(received[tradeIndex]);
            }
            var savedTradesCounts = {};
            for (var tradeIndex in allTrades) {
                var trade = allTrades[tradeIndex];
                if (!savedTradesCounts.hasOwnProperty(trade.partner))
                    savedTradesCounts[trade.partner] = 0;
                savedTradesCounts[trade.partner] = savedTradesCounts[trade.partner] + 1;
                if (savedTradesCounts[trade.partner] >= 5)
                    tradeToCancelDueToPersonalLimit.push(trade);

                if (tradeToCancelDueToTotalLimit == undefined || tradeToCancelDueToTotalLimit.updated.getTime() > trade.updated.getTime()) {
                    tradeToCancelDueToTotalLimit = trade;
                }
            }
            if (tradeToCancelDueToPersonalLimit.length >= 0 && self.settings.cancelTradeOnOverflow) {
                for (var tradeIndex in tradeToCancelDueToPersonalLimit) {
                    if (self.logger != undefined)
                        self.logger.log('debug', "Cancelled trade #" + tradeToCancelDueToPersonalLimit[tradeIndex].id + " due to overload in personal trade requests");
                    tradeToCancelDueToPersonalLimit[tradeIndex].cancel();
                }
            }
            if (allTrades.length >= 30 && self.settings.cancelTradeOnOverflow) {
                if (self.logger != undefined)
                    self.logger.log('debug', "Cancelled trade #" + tradeToCancelDueToTotalLimit.id + " due to overload in total trade requests");
                tradeToCancelDueToTotalLimit.cancel();
            }
            self.emit('createdOffer', sid);
            if (self.logger != undefined)
                self.logger.log('debug', 'Sent trade offer');
            return callback(undefined, self.trade.createOffer(sid));

        });
    } else {
        if (self.logger != undefined)
            self.logger.log('debug', 'Sent trade offer');
        self.emit('createdOffer', sid);
        // Before we create an offer, we will get previous offers and ensure it meets the limitations, to avoid errors.
        return callback(undefined, self.trade.createOffer(sid));
    }
};

/**
 * @callback acceptedTradesCallback
 * @param {Error} error - An error message if the process failed, undefined if successful
 * @param {Array} acceptedTrades - An array of trades that were confirmed in the process.
 */

/**
 * Confirm (not accept) all sent trades associated with a certain SteamID via the two-factor authenticator.
 * @param {SteamID} steamID - SteamID to use for lookup of inventory
 * @param {acceptedTradesCallback} acceptedTradesCallback - Inventory details (refer to inventoryCallback for more info.)
 */
Trade.prototype.confirmTradesFromUser = function (SteamID, callback) {
    var self = this;

    self.trade.getOffers(1, undefined, function (err, sent, received) {
        var acceptedTrades = [];
        for (var sentOfferIndex in sent) {
            if (sent.hasOwnProperty(sentOfferIndex)) {
                var sentOfferInfo = sent[sentOfferIndex];
                if (sentOfferInfo.partner.getSteamID64() == SteamID.getSteamID64) {
                    sentOfferInfo.accept();
                    acceptedTrades.push(sentOfferInfo);
                }
            }
        }

        for (var receivedOfferIndex in received) {
            if (received.hasOwnProperty(receivedOfferIndex)) {
                var receievedOfferInfo = received[receivedOfferIndex];
                if (receievedOfferInfo.partner.getSteamID64() == SteamID.getSteamID64) {
                    receievedOfferInfo.accept();
                    acceptedTrades.push(receievedOfferInfo);
                }
            }
        }
        self.confirmOutstandingTrades(function (err, confirmedTrades) {
            callback(err, acceptedTrades);
        });
    });
};

/**
 * @callback inventoryCallback
 * @param {Error} error - An error message if the process failed, undefined if successful
 * @param {Array} inventory - An array of Items returned via fetch (if undefined, then game is not owned by user)
 * @param {Array} currencies - An array of currencies (Only a few games use this) - (if undefined, then game is not owned by user)
 */

/**
 * Retrieve account inventory based on filters
 * @param {Integer} appid - appid by-which to fetch inventory based on.
 * @param {Integer} contextid - contextid of lookup (1 - Gifts, 2 - In-game Items, 3 - Coupons, 6 - Game Cards, Profile Backgrounds & Emoticons)
 * @param {Boolean} tradableOnly - Items retrieved must be tradable
 * @param {inventoryCallback} inventoryCallback - Inventory details (refer to inventoryCallback for more info.)
 */
Trade.prototype.getInventory = function (appid, contextid, tradableOnly, inventoryCallback) {
    var self = this;
    if (!self.loggedIn) {
        self.addToQueue('login', self.getInventory, [appid, contextid, tradableOnly, inventoryCallback]);
    }
    else
        self.trade.loadInventory(appid, contextid, tradableOnly, inventoryCallback);
};

/**
 * Retrieve account inventory based on filters and provided steamID
 * @param {SteamID} steamID - SteamID to use for lookup of inventory
 * @param {Integer} appid - appid by-which to fetch inventory based on.
 * @param {Integer} contextid - contextid of lookup (1 - Gifts, 2 - In-game Items, 3 - Coupons, 6 - Game Cards, Profile Backgrounds & Emoticons)
 * @param {Boolean} tradableOnly - Items retrieved must be tradableOnly
 * @param {inventoryCallback} inventoryCallback - Inventory details (refer to inventoryCallback for more info.)
 */
Trade.prototype.getUserInventory = function (steamID, appid, contextid, tradableOnly, inventoryCallback) {
    var self = this;
    if (!self.loggedIn) {
        self.addToQueue('login', self.getUserInventory, [steamID, appid, contextid, tradableOnly, inventoryCallback]);
    }
    else
        self.trade.loadUserInventory(steamID, appid, contextid, tradableOnly, inventoryCallback);
};


Trade.prototype.getStateName = function (state) {
    var self = this;
    return self.trade.getStateName(state);
};


module.exports = Trade;