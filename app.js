const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
let db = null;

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

//initializeDBAndServer
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Authenticate Token
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "dsfvnvksnvvl", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const { username } = payload;
        const selectUserId = `
        SELECT user_id
        FROM user
        WHERE username = '${username}'`;
        const dbResponse = await db.get(selectUserId);
        const { user_id } = dbResponse;
        request.userId = user_id;
        next();
      }
    });
  }
};

//User Registration API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT *
    FROM user 
    WHERE username LIKE '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const passwordLength = password.length;
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const insertUserQuery = `
            INSERT INTO user (name, username, password, gender)
            VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(insertUserQuery);
      response.send("User created successfully");
    }
  }
});

//User Login API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username LIKE '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "dsfvnvksnvvl");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get Tweets API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const selectTweetsQuery = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T JOIN tweet ON T.following_user_id = tweet.user_id
    WHERE follower.follower_user_id = ${userId}
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  const dbResponse = await db.all(selectTweetsQuery);
  response.send(dbResponse);
});

//Get Following People Names API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const selectFollowingNamesQuery = `
    SELECT user.name 
    FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};`;
  const dbResponse = await db.all(selectFollowingNamesQuery);
  response.send(dbResponse);
});

//Get Follower People Names API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const selectFollowersPeopleQuery = `
    SELECT user.name
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${userId};`;
  const dbResponse = await db.all(selectFollowersPeopleQuery);
  response.send(dbResponse);
});

//Get Tweet API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const api6Output = (getTweetDetails, getLikesCount, getRepliesCount) => {
    return {
      tweet: getTweetDetails.tweet,
      likes: getLikesCount.likes,
      replies: getRepliesCount.replies,
      dateTime: getTweetDetails.date_time,
    };
  };
  const { userId } = request;
  const { tweetId } = request.params;
  const followingUserIdsQuery = `
  SELECT following_user_id FROM follower WHERE follower_user_id = ${userId};`;
  const followingUserIdArray = await db.all(followingUserIdsQuery);
  const getFollowingUserIds = followingUserIdArray.map((eachFollowingUser) => {
    return eachFollowingUser.following_user_id;
  });
  const selectTweetIdsQuery = `
  SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingUserIds});`;
  const tweetIdsArray = await db.all(selectTweetIdsQuery);
  const getFollowingUserTweetIds = tweetIdsArray.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  if (getFollowingUserTweetIds.includes(parseInt(tweetId))) {
    const selectTweetQuery = `
      SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`;
    const getTweetDetails = await db.get(selectTweetQuery);
    const selectLikesCount = `
      SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id = ${tweetId};`;
    const getLikesCount = await db.get(selectLikesCount);
    const selectRepliesCount = `
      SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id = ${tweetId};`;
    const getRepliesCount = await db.get(selectRepliesCount);
    response.send(api6Output(getTweetDetails, getLikesCount, getRepliesCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Get Likes API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const followingUserIdsQuery = `
  SELECT following_user_id FROM follower WHERE follower_user_id = ${userId};`;
    const followingUserIdArray = await db.all(followingUserIdsQuery);
    const getFollowingUserIds = followingUserIdArray.map(
      (eachFollowingUser) => {
        return eachFollowingUser.following_user_id;
      }
    );
    const selectTweetIdsQuery = `
  SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingUserIds});`;
    const tweetIdsArray = await db.all(selectTweetIdsQuery);
    const getFollowingUserTweetIds = tweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    if (getFollowingUserTweetIds.includes(parseInt(tweetId))) {
      const selectLikesCount = `
      SELECT user.username AS name FROM user INNER JOIN like ON user.user_id = like.user_id WHERE like.tweet_id = ${tweetId};`;
      const getLikedUserNames = await db.all(selectLikesCount);
      const getLikedUserNamesArray = getLikedUserNames.map((eachObject) => {
        return eachObject.name;
      });
      response.send({ likes: getLikedUserNamesArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get Replies API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const selectRepliesQuery = `
    SELECT user.name, reply.reply
    FROM (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T INNER JOIN reply ON T.following_user_id = reply.user_id
    WHERE follower.follower_user_id = ${userId} AND reply.tweet_id = ${tweetId};`;
    const dbResponse = await db.all(selectRepliesQuery);
    if (dbResponse[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let nameList = [];
      for (let i = 0; i < dbResponse.length; i++) {
        nameList.push(dbResponse[i]);
      }
      response.send({ replies: nameList });
    }
  }
);

//Get Tweets API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const api9Output = (getTweetDetails, getLikesCount, getRepliesCount) => {
    return {
      tweet: getTweetDetails.tweet,
      likes: getLikesCount.likes,
      replies: getRepliesCount.replies,
      dateTime: getTweetDetails.date_time,
    };
  };
  const selectTweetIdsQuery = `
  SELECT tweet_id FROM tweet WHERE user_id = ${userId};`;
  const tweetIdsArray = await db.all(selectTweetIdsQuery);
  const getUserTweetIds = tweetIdsArray.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  const tweetsOfTheUser = [];
  for (let i = 0; i < getUserTweetIds.length; i++) {
    const tweetId = getUserTweetIds[i];
    const selectTweetQuery = `
      SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`;
    const getTweetDetails = await db.get(selectTweetQuery);
    const selectLikesCount = `
      SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id = ${tweetId};`;
    const getLikesCount = await db.get(selectLikesCount);
    const selectRepliesCount = `
      SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id = ${tweetId};`;
    const getRepliesCount = await db.get(selectRepliesCount);
    const eachTweetOfUser = api9Output(
      getTweetDetails,
      getLikesCount,
      getRepliesCount
    );
    tweetsOfTheUser.push(eachTweetOfUser);
  }
  response.send(tweetsOfTheUser);
});

//Insert Tweet API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { tweet } = request.body;
  const insertTweetQuery = `
    INSERT INTO tweet (tweet)
    VALUES ('${tweet}');`;
  await db.run(insertTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE user_id = ${userId} AND tweet_id = ${tweetId};`;
    dbResponse = await db.run(deleteTweetQuery);
    console.log(dbResponse);
    const { changes } = dbResponse;
    if (changes === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
