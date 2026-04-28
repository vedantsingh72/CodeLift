import express from "express";
import dotenv from "dotenv";
import http from "http";
import {Server} from "socket.io";
dotenv.config();
const app=express();

const server = http.createServer(app);
const io=new Server(server,{
      cors:{
            origin:"*",
            allowedHeaders:["*"],
      },
});

const PORT=process.env.PORT|| 3000;

app.get("/",(req,res)=>{
    res.send("Whatsapp backend is running");
});

app.listen(PORT,()=>{
    console.log("Server  is running on port "+PORT);
});




io.on("connection",()=>{
    console.log("A user is connected");
});

