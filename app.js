require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { resolveSrv } = require("dns/promises");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "iamawebdeveloper",
    resave: false,
    saveUninitialized: false,
  })
);

//initialising passport (below the session):
app.use(passport.initialize());
//using passport to setup our session
app.use(passport.session({}));

//connecting to the database
let connection_URL =
  "mongodb+srv://ramukaka:kakikegolgol@cluster0.0jixd.mongodb.net/?retryWrites=true&w=majority";
mongoose.connect(
  connection_URL,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  (err) => {
    if (err) {
      console.log("Error in connecting:", err);
    }
    console.log("Database connected to the server!");
  }
);

//creating  schemas
const postSchema = new mongoose.Schema({
  username: String,
  caption: String,
  image: {
    data: Buffer,
    contentType: String,
  },
});
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  googleId: String,
});

//adding  plugin to the schema
//1. ENCRYPTION PLUGIN
// userSchema.plugin(encrypt, {
//   secret: process.env.SECRET,
//   encryptedFields: ["password"],
// });

//2. PASSPORT LOCAL MONGOOSE PLUGIN
userSchema.plugin(passportLocalMongoose);

//3. findOrCreate plugin
userSchema.plugin(findOrCreate);

//creating model
const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

//making disk storage for uploading files

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now());
  },
});

const maxSize = 1 * 1000 * 1000;

//uploading the file
const upload = multer({
  storage: storage,
  limits: { fileSize: maxSize },
  fileFilter: function (req, file, cb) {
    // Set the filetypes, it is optional
    var filetypes = /jpeg|jpg|png/;
    var mimetype = filetypes.test(file.mimetype);

    var extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(
      "Error: File upload only supports the " +
        "following filetypes - " +
        filetypes
    );
  },
});
//passport local configuration (just below the model)

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

// used to deserialize the user
passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

//configuring strategy(below the serialisation and deserialisation)
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/secrets",
    },
    function (accessToken, refreshToken, profile, cb) {
      console.log(profile);
      User.findOrCreate({ googleId: profile.id }, function (err, user) {
        console.log(err);
        return cb(err, user);
      });
    }
  )
);

const port = process.env.PORT || 8081;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/secrets",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect("/");
  }
);

app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/secrets", (req, res) => {
  if (req.isAuthenticated) {
    User.find(function (err, user) {
      if (err) {
        console.log("Could not find any user: ", err);
      } else {
        Post.find(function (err, posts) {
          if (err) {
            console.log("Could not find any document: ", err);
          } else {
            res.render("home", { posts: posts, user: req.user });
          }
        });
      }
    });
  } else {
    res.render("signup");
  }
});
let posts;
let user = {
  username: "Guest",
};

app.get("/", (req, res) => {
  res.render("home", { posts: posts, user: user });
});

app.get("/logout", function (req, res) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
  });
  res.redirect("/signup");
});
//posting data
// const __dirname = path.resolve();

app.post("/secrets", upload.single("photos"), (req, res) => {
  if (!req.body.image) {
    res.write("no image found !");
  }
  if (req.body.submit === "postCreated") {
    const post = Post({
      username: req.user.username,
      caption: req.body.caption,
      image: {
        data: fs.readFileSync(
          path.join(__dirname + "/uploads/" + req.file.filename)
        ),
        contentType: "image/jpeg",
      },
    });

    Post.create(post, function (err, posts) {
      if (err) {
        console.log(err);
      } else {
        res.redirect("/secrets");
      }
    });
  }
});
app.post("/register", (req, res) => {
  User.register(
    { username: req.body.username },
    req.body.password,
    (err, results) => {
      if (err) {
        console.log("User already registered ");
        res.render("register");
      } else {
        //authenticating user

        passport.authenticate("local")(req, res, () => {
          //if the registration authentication is completed then the salt and hash gets automatically created using passport, passport-local and  passport-local-mongoose
          res.redirect("/login");

          // res.redirect("/");
        });
      }
    }
  );
  // bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
  //   const newUser = new User({
  //     email: req.body.username,
  //     password: hash,
  //   });
  //   newUser.save((err) => {
  //     err ? console.log(err) : console.log(res.render("secrets"));
  //   });
  // });
});

app.post("/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  //loging in the  existing user

  const user = new User({
    username: username,
    password: password,
  });

  req.login(user, (err) => {
    if (err) {
      res.render("reset");
    } else {
      passport.authenticate("local")(req, res, () => {
        User.create(user, (req, res) => {
          if (err) {
            console.log("Error in creating user");
          } else {
            console.log("User added to the database ");
          }
        });
        res.redirect("/secrets");

        // res.redirect("/");
      });
    }
  });
});

app.get("/reset", (req, res) => {
  res.render("reset");
});
app.post("/reset", (req, res) => {
  passport.authenticate("local", function (err, user, info) {
    User.findById(req.user._id)
      .then((foundUser) => {
        foundUser
          .changePassword(req.body.old_password, req.body.new_password)
          .then(() => {
            passport.authenticate("local")(req, res, () => {
              console.log("password changed");
            });
          })
          .catch((error) => {
            console.log(error);
          });
      })
      .catch((error) => {
        console.log(error);
      });
  });
});
