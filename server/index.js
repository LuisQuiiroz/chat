import express from 'express'
import logger from 'morgan'
import sqlite3 from 'sqlite3'

import { Server } from 'socket.io'
import {createServer} from 'node:http'

const port = process.env.PORT ?? 3000

const app = express()

const db = new sqlite3.Database('./server/messages.db')

const server = createServer(app) // crear servidor http de node
const io = new Server(server, {
  connectionStateRecovery: {}
}) // le pasamos a web sockets el servidor http

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )`, (err) => {
    if (err) {
      console.error('Error al crear la tabla de mensajes:', err.message)
    } else {
      console.log('Tabla de mensajes creada exitosamente')
    }
  })
})


io.on('connection', (socket) => {
  const user = socket.handshake.auth.username ?? 'Anonymous'

  console.log(`User ${user} connected`)

  socket.on('disconnect', () => {
    console.log(`User ${user} disconnected`)
  })

  socket.on('chat message', (message) => {
    const username = socket.handshake.auth.username ?? 'Anonymous'
    db.run('INSERT INTO messages (content, user) VALUES (?, ?)', [message, username], (err) => {
      if (err) {
        console.error('Error al agregar la tarea:', err.message)
        return
      } else {
        db.get('SELECT last_insert_rowid() as id', (err, row) => {
          if (err) {
            console.error('Error al obtener el ID del mensaje:', err.message)
            return
          } else {
            io.emit('chat message', message, row.id, username) 
          }
        })
      }
    })
  })
  
  // console.log(socket.handshake.auth)
  
  if(!socket.recovered){ // recuperar los mensajes
    db.all('SELECT * FROM messages WHERE id > (?)', [socket.handshake.auth.serverOffset ?? 0], (err, rows) => {
      if (err) {
        console.error('Error al obtener los mensajes:', err.message)
        return
      } else {
        const recientes = rows.slice(-50)
        recientes.forEach(row => {
          socket.emit('chat message', row.content, row.id, row.user) 
        })
      }
    })
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})