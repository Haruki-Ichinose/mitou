// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:8000/api/players/')
      .then(response => {
        setPlayers(response.data);
      })
      .catch(error => {
        console.error('There was an error fetching the players!', error);
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>選手一覧</h1>
        <ul>
          {players.map(player => (
            <li key={player.id}>{player.name} ({player.position})</li>
          ))}
        </ul>
      </header>
    </div>
  );
}

export default App;