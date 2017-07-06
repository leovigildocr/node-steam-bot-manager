Community.prototype.__proto__ = require('events').EventEmitter.prototype;
const EResult = require("../enums/EResult");
const SteamID = require('steam-tradeoffer-manager').SteamID;


//
function Community(community, Auth, logger) {
    // Ensure account values are valid
    var self = this;
    self.community = community;
    self.Auth = Auth;
    self.logger = logger;
}


/**
 * Upvote an attachement file on SteamCommunity
 * @param sharedFileId
 * @param callbackErrorOnly
 */
Community.prototype.upvoteSharedFile = function (sharedFileId, callbackErrorOnly) {
    var self = this;

    var options = {
        form: {
            'sessionid': self.Auth.sessionid,
            'id': sharedFileId
        }
    };

    self.community.httpRequestPost('https://steamcommunity.com/sharedfiles/voteup', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};
/**
 * Downvote an attachement file on SteamCommunity.
 * @param sharedFileId
 * @param callbackErrorOnly
 */
Community.prototype.downvoteSharedFile = function (sharedFileId, callbackErrorOnly) {
    var self = this;

    var options = {
        form: {
            'sessionid': self.Auth.sessionid,
            'id': sharedFileId
        }
    };

    self.community.httpRequestPost('https://steamcommunity.com/sharedfiles/votedown', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};


/**
 * Preview an attachement file on SteamCommunity to increase the unique views of a certain attachment
 * @param sharedFileId
 * @param callbackErrorOnly
 */
Community.prototype.previewSharedFile = function (sharedFileId, callbackErrorOnly) {
    var self = this;

    var options = {};

    self.community.httpRequestGet('http://steamcommunity.com/sharedfiles/filedetails/?id=' + sharedFileId, options, function (error, response, body) {
        if (response.statusCode == 200)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error);
    });
};


/**
 * Favourite an attachement file on SteamCommunity.
 * @param sharedFileId
 * @param callbackErrorOnly
 */
Community.prototype.favouriteSharedFile = function (sharedFileId, callbackErrorOnly) {
    var self = this;

    var options = {
        form: {
            'sessionid': self.Auth.sessionid,
            'id': sharedFileId
        }
    };

    self.community.httpRequestPost('http://steamcommunity.com/sharedfiles/favorite', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};

/**
 * Unfavourite an attachement file on SteamCommunity.
 * @param sharedFileId
 * @param callbackErrorOnly
 */
Community.prototype.unfavouriteSharedFile = function (sharedFileId, callbackErrorOnly) {
    var self = this;

    var options = {
        form: {
            'sessionid': self.Auth.sessionid,
            'id': sharedFileId
        }
    };

    self.community.httpRequestPost('http://steamcommunity.com/sharedfiles/unfavorite', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};


/**
 * Follow a user on SteamCommunity.
 * @param steamid | profile name or steamid2, steamid3, steamid64
 * @param callbackErrorOnly
 */
Community.prototype.followPublisher = function (steamid, callbackErrorOnly) {
    var self = this;
    var user = null;
    try {
        var steamID = new SteamID(steamid);
        user = 'profiles/' + steamID.getSteamID64();
    } catch (e){
        user = 'id/' + steamid;

    }

    var options = {
        form: {
            'sessionid': self.Auth.sessionid
        }
    };

    self.community.httpRequestPost('https://steamcommunity.com/' + user + '/followuser/', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};
/**
 * Unfollow a user on SteamCommunity.
 * @param steamid | SteamID object or profile name
 * @param callbackErrorOnly
 */
Community.prototype.unfollowPublisher = function (steamid, callbackErrorOnly) {
    var self = this;
    var user = null;
    try {
        var steamID = new SteamID(steamid);
        user = 'profiles/' + steamID.getSteamID64();
    } catch (e){
        user = 'id/' + steamid;

    }


    var options = {
        form: {
            'sessionid': self.Auth.sessionid
        }
    };

    self.community.httpRequestPost('https://steamcommunity.com/' + user + '/unfollowuser/', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};


/**
 * Invite a user on SteamCommunity to a group.
 * @param groupID
 * @param steamIDInvitee | Either an array list of steamid's or a single steamid. Must be an array object if list.
 * @param callbackErrorOnly
 */
Community.prototype.inviteToGroup = function (groupID, steamIDInvitee, callbackErrorOnly) {
    var self = this;

    var options = {
        form: {
            'json': 1,
            'type': 'groupInvite',
            'group': groupID,
            'sessionid': self.Auth.sessionid
        }
    };
    if ( steamIDInvitee instanceof Array )
        params.invitee_list = JSON.stringify( steamIDInvitee );
    else
        params.invitee = steamIDInvitee;


    self.community.httpRequestPost('https://steamcommunity.com/actions/GroupInvite', options, function (error, response, body) {
        if (response.statusCode == 200 && JSON.parse(body).success == 1)
            callbackErrorOnly(undefined);
        else if (response.statusCode == 200 && JSON.parse(body).duplicate)
            callbackErrorOnly("Failed to send one or more invites due to a user being already in the group.");
        else
            callbackErrorOnly(error || EResult[JSON.parse(body).success]);
    });
};




/**
 * Set-up a profile if the account is new and profile is not set-up yet.
 * @param callbackErrorOnly
 */
Community.prototype.setupProfile = function (callbackErrorOnly) {
    var self = this;
    self.community.setupProfile(callbackErrorOnly);
};


module.exports = Community;
