package game.logic;

import game.model.Board;

public class GameEngine {
    private Board board;

    public GameEngine(Board board) {
        this.board = board;
    }

    public void startGame() {
        board.initializeRandom();
    }
}