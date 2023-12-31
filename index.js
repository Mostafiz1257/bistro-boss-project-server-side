const express = require('express');
require('dotenv').config()
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    console.log(authorization);
    if (!authorization) {
        return res.status(401).send({ error: true, message: "unauthorized access" })
    }
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: "unauthorized access" })
        }
        req.decoded = decoded;
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.esni35a.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const usersCollection = client.db("bistroBossDb").collection('users')
        const menuCollection = client.db("bistroBossDb").collection('menu')
        const reviewCollection = client.db('bistroBossDb').collection('reviews')
        const cartCollection = client.db("bistroBossDb").collection('carts')
        const paymentCollection = client.db("bistroBossDb").collection('payments')

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: "1h" })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: "forbidden message" })
            }
            next();

        }

        //user collection
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id
            console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const exitingUser = await usersCollection.findOne(query)
            if (exitingUser) {

                return { message: "user already exit" }
            }
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email != email) {
                return ({ admin: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })


        //menu collection
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        })

        app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
            const newItem = req.body;
            const result = await menuCollection.insertOne(newItem);
            res.send(result)
        })
        app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            console.log(id, query)
            const result = await menuCollection.deleteOne(query)
            res.send(result)
        })
        //review collection
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        //cart Collection
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded.email;

            if (email != decodedEmail) {
                return res.status(401).send({ error: true, message: "unauthorized access" })
            }
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;

            const result = await cartCollection.insertOne(item)
            res.send(result)
        })
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })
        //payment-method-intent

        // app.post('/create-payment-intent',verifyJWT, async (req, res) => {
        //     const { price } = req.body;
        //     const amount = price * 100;
        //     console.log("price and amount", price,amount);
        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: "usd",
        //         payment_method_types: ["card"]

        //     })
        //     res.send({
        //         clientSecret: paymentIntent.client_secret,
        //     })
        //     console.log("client Secret". clientSecret);
        // })


        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = (price * 100);
            console.log("price and amount", price, amount);

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: "usd",
                    payment_method_types: ["card"]
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });

                console.log("client Secret", paymentIntent.client_secret);
            }
            catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        app.post('/payments',verifyJWT, async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment)
            const query = {_id: {$in: payment.cardItems.map(id=> new ObjectId(id))}}
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({result,deleteResult})
        })

     
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Boss is coming')
})

app.listen(port, () => {
    console.log(`Bistro boss is running is port ${port}`);
})

