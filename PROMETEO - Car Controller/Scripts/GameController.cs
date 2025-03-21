using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

public class GameManager : MonoBehaviour
{
    // 初始游戏数据
    [Header("难度设置")]
    public int initialKeyUsage = 5;
    public int initialCollisionChance = 10;
    public AudioSource collideSound; 

    // 当前游戏数据
    private int currentKeys;
    private int currentCollisions;
    private float countingTime;
    private bool isGameActive;
    private int lastCollideTime = 0;

    // UI引用
    public Text keysText;
    public Text collisionsText;
    public Text timerText;
    public Button startButton;
    public GameObject gameEndPanel;
    public Text resultText;

    public static GameManager Instance { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(this);
        }
        else
        {
            Instance = this;
        }
    }

    void Start()
    {
        // 初始化UI状态
        gameEndPanel.SetActive(false);
        //startButton.onClick.AddListener(StartNewGame);
        StartNewGame();
        UpdateUI();
    }

    void Update()
    {
        if (isGameActive)
        {
            // 更新倒计时
            countingTime += Time.deltaTime;
            UpdateTimerDisplay();
        }
    }

    public bool IsActive()
    {
        return isGameActive;
    }

    public void StartNewGame()
    {
        // 重置游戏数据
        currentKeys = initialKeyUsage;
        currentCollisions = initialCollisionChance;
        countingTime = 0;
        isGameActive = true;
        lastCollideTime = 0;
        keyIds = new List<int>();

        // 重置UI
        gameEndPanel.SetActive(false);
        UpdateUI();
        Time.timeScale = 1f;
    }

    // 使用车钥匙方法
    private List<int> keyIds = new List<int>();
    public bool UseCarKey(int keyId)
    {
        if (keyIds.Contains(keyId))
        {
            return true;
        }
        keyIds.Add(keyId);
        if (isGameActive && currentKeys > 0)
        {
            currentKeys--;
            keysText.text = $"钥匙次数: {currentKeys}";
            return true;
        }
        return false;
    }

    // 处理碰撞事件
    public void HandleCollision()
    {
        if (!isGameActive) return;

        int currentTime = Mathf.FloorToInt(countingTime);
        if ((currentTime - lastCollideTime) < 3)
        {
            return;
        }

        lastCollideTime = currentTime;
        collideSound.Play();
        if (currentCollisions > 0)
        {
            currentCollisions--;
            collisionsText.text = $"剩余碰撞: {currentCollisions}";
        }

        if (currentCollisions <= 0)
        {
            GameEnd(false);
        }
    }

    // 更新所有UI显示
    void UpdateUI()
    {
        keysText.text = $"钥匙次数: {currentKeys}";
        collisionsText.text = $"剩余碰撞: {currentCollisions}";
        UpdateTimerDisplay();
    }

    // 更新计时器显示
    void UpdateTimerDisplay()
    {
        int seconds = Mathf.FloorToInt(countingTime);
        timerText.text = $"时间: {seconds}";
    }

    // 游戏结束处理
    public void GameEnd(bool pass)
    {
        isGameActive = false;
        Time.timeScale = 0f;
        gameEndPanel.SetActive(true);
        resultText.text = pass ? "挑战成功^_^!" : "挑战失败T_T.";
    }
}